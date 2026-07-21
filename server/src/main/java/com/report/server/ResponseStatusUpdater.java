package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.exception.transaction.CommitConflictException;
import com.scalar.db.exception.transaction.CrudConflictException;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Transactional status-transition update for form responses (#163/#205): read-validate-write with
 * OCC retry, atomic document numbering on draft→issued, and audit-trail wiring. Extracted from
 * FormResponseController (#276) — no behavior change (logs keep the FormResponseController
 * category).
 */
final class ResponseStatusUpdater {

    private static final Logger log = LoggerFactory.getLogger(FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final int STATUS_MAX_OCC_RETRIES = 3;
    private static final long STATUS_INITIAL_BACKOFF_MS = 20;

    /** Best-effort audit-trail sink ({@code from → to} transition records, #188). */
    @FunctionalInterface
    interface AuditSink {
        void record(String responseId, String templateId, String from, String to, String by);
    }

    private ResponseStatusUpdater() {}

    /**
     * Apply a validated status transition with OCC retry (#205): the transition is validated
     * against the status re-read inside the transaction, so two concurrent PATCHes (or a PATCH
     * racing a data edit) can no longer lose an update or drive the status machine backwards.
     * Document numbering (draft→issued) happens in the same TX.
     */
    static void update(
            Context ctx,
            JsonBlobRepository responseRepo,
            SequenceController sequenceCtrl,
            AuditSink audit,
            String templateId,
            String responseId,
            Principal principal,
            String newStatus,
            String templateOwner) {
        for (int attempt = 0; attempt < STATUS_MAX_OCC_RETRIES; attempt++) {
            if (attempt > 0) sleepBackoff(attempt);
            DistributedTransaction tx = null;
            try {
                tx = responseRepo.getTransactionManager().start();

                Optional<String> storedOpt = responseRepo.getWithinTx(tx, responseId);
                if (storedOpt.isEmpty()) {
                    tx.abort();
                    ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
                    return;
                }
                ObjectNode node = (ObjectNode) MAPPER.readTree(storedOpt.get());
                if (!templateId.equals(node.path("templateId").asText(""))) {
                    tx.abort();
                    ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
                    return;
                }

                // Same access rule as delete: template owner or original submitter.
                String submittedBy = node.path("submittedBy").asText("");
                boolean isSubmitter = principal.userId().equals(submittedBy);
                boolean isOwner =
                        !templateOwner.isEmpty() && principal.userId().equals(templateOwner);
                if (!isSubmitter && !isOwner) {
                    tx.abort();
                    ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
                    return;
                }

                String oldStatus = node.path("status").asText(ResponseStatusPolicy.DEFAULT_STATUS);
                if (oldStatus.equals(newStatus)) {
                    // Idempotent no-op — nothing to persist or audit.
                    tx.abort();
                    Map<String, Object> noop = new LinkedHashMap<>();
                    noop.put("id", responseId);
                    noop.put("status", newStatus);
                    ctx.json(noop);
                    return;
                }
                if (!ResponseStatusPolicy.isValidTransition(oldStatus, newStatus)) {
                    tx.abort();
                    ApiError.respond(
                            ctx,
                            HttpStatus.CONFLICT,
                            "CONFLICT",
                            "Invalid status transition: " + oldStatus + " → " + newStatus);
                    return;
                }

                node.put("status", newStatus);

                // Assign a document number on the first draft→issued transition when the
                // template has a sequence configured and no number yet (#189) — atomically,
                // in this same transaction (#205).
                String assignedNumber = null;
                boolean needsNumber =
                        "issued".equals(newStatus)
                                && node.path("documentNumber").asText("").isEmpty();
                if (needsNumber && sequenceCtrl != null) {
                    assignedNumber = sequenceCtrl.nextNumberWithinTx(tx, templateId);
                    if (assignedNumber != null) node.put("documentNumber", assignedNumber);
                }

                responseRepo.putWithinTx(
                        tx, responseId, MAPPER.writeValueAsString(node), templateId);
                tx.commit();

                // Append to the status-transition audit trail (#188)
                audit.record(responseId, templateId, oldStatus, newStatus, principal.userId());

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("id", responseId);
                result.put("status", newStatus);
                if (assignedNumber != null) result.put("documentNumber", assignedNumber);
                ctx.json(result);
                return;

            } catch (CommitConflictException | CrudConflictException e) {
                abortQuietly(tx); // transient OCC conflict — retry with a fresh transaction
            } catch (Exception e) {
                abortQuietly(tx);
                log.error("Failed to update status for response {}", responseId, e);
                ApiError.respond(
                        ctx,
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "INTERNAL_ERROR",
                        "Failed to update status");
                return;
            }
        }
        // Retries exhausted under sustained contention.
        ApiError.respond(
                ctx, HttpStatus.CONFLICT, "CONFLICT", "Status update conflict; please retry");
    }

    private static void sleepBackoff(int attempt) {
        try {
            Thread.sleep((long) Math.pow(2, attempt - 1) * STATUS_INITIAL_BACKOFF_MS);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx != null) {
            try {
                tx.abort();
            } catch (Exception ignored) {
            }
        }
    }
}
