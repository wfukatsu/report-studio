package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.exception.transaction.CommitConflictException;
import com.scalar.db.exception.transaction.CrudConflictException;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Document auto-numbering (自動採番) per template.
 *
 * <ul>
 *   <li>GET /api/v1/sequences/{templateId} — get config
 *   <li>PUT /api/v1/sequences/{templateId} — update config
 * </ul>
 *
 * <p>Sequence increment is done atomically within a single ScalarDB DistributedTransaction
 * (read-then-write) with OCC retry. The {@code {{documentNumber}}} token is inserted into form
 * responses at submission time.
 */
public final class SequenceController {

    private static final Logger log = LoggerFactory.getLogger(SequenceController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");
    private static final int MAX_OCC_RETRIES = 5;
    private static final long INITIAL_BACKOFF_MS = 50;

    private final JsonBlobRepository seqRepo;
    private final JsonBlobRepository definitionsRepo;

    public SequenceController(JsonBlobRepository seqRepo, JsonBlobRepository definitionsRepo) {
        this.seqRepo = seqRepo;
        this.definitionsRepo = definitionsRepo;
    }

    /**
     * Reject access to a sequence config whose template the caller does not own (issue #198).
     * Returns true and sends a 404 when access is denied — callers must {@code return} on true.
     */
    private boolean denyIfNotOwner(Context ctx, String templateId) {
        if (TemplateController.ownsTemplate(ctx, definitionsRepo, templateId)) return false;
        ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
        return true;
    }

    // ── GET /api/v1/sequences/{templateId} ───────────────────────────────────

    public void getConfig(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx, "templateId");
        if (templateId == null) return;
        if (denyIfNotOwner(ctx, templateId)) return;

        Optional<String> stored = seqRepo.get(templateId);
        if (stored.isEmpty()) {
            // Return default (unconfigured)
            ctx.json(Map.of("configured", false));
            return;
        }
        ctx.contentType("application/json");
        ctx.result(stored.get());
    }

    // ── PUT /api/v1/sequences/{templateId} ───────────────────────────────────

    public void putConfig(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;
        String templateId = RequestValidator.validateId(ctx, "templateId");
        if (templateId == null) return;
        if (denyIfNotOwner(ctx, templateId)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(ctx.body());
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Transactional read-modify-write with OCC retry (#207). The previous plain
        // get()→put() read the counter outside any transaction, so a concurrent nextAndStamp
        // increment could be overwritten with the stale counter — rewinding the sequence and
        // re-issuing already-used document numbers. Here the config is re-read inside the
        // transaction and only the presentation fields (prefix/suffix/digits/resetOn) come
        // from the request; counter/resetYear are always preserved from stored state, never
        // taken from the client.
        Exception lastException = null;
        for (int attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
            if (attempt > 0) {
                Thread.sleep((long) Math.pow(2, attempt - 1) * INITIAL_BACKOFF_MS);
            }
            DistributedTransaction tx = null;
            try {
                tx = seqRepo.getTransactionManager().start();

                Optional<String> storedOpt = seqRepo.getWithinTx(tx, templateId);
                ObjectNode config =
                        storedOpt.isPresent()
                                ? (ObjectNode) MAPPER.readTree(storedOpt.get())
                                : MAPPER.createObjectNode();

                if (req.has("prefix")) config.put("prefix", req.path("prefix").asText(""));
                if (req.has("suffix")) config.put("suffix", req.path("suffix").asText(""));
                if (req.has("digits"))
                    config.put("digits", Math.max(1, Math.min(10, req.path("digits").asInt(4))));
                if (req.has("resetOn")) {
                    String resetOn = req.path("resetOn").asText(null);
                    if ("year".equals(resetOn)) config.put("resetOn", "year");
                    else config.putNull("resetOn");
                }
                // counter / resetYear are sequence state — preserve stored values, never accept
                // them from the request; initialise only when absent.
                if (!config.has("counter")) config.put("counter", 0);
                if (!config.has("resetYear")) config.put("resetYear", 0);

                seqRepo.putWithinTx(tx, templateId, MAPPER.writeValueAsString(config));
                tx.commit();

                ctx.contentType("application/json");
                ctx.result(MAPPER.writeValueAsString(config));
                return;

            } catch (CommitConflictException | CrudConflictException e) {
                lastException = e;
                try {
                    if (tx != null) tx.abort();
                } catch (Exception ignored) {
                }
            } catch (Exception e) {
                try {
                    if (tx != null) tx.abort();
                } catch (Exception ignored) {
                }
                throw e;
            }
        }
        throw new RuntimeException(
                "Sequence config OCC conflict unresolved after " + MAX_OCC_RETRIES + " retries",
                lastException);
    }

    // ── Atomic next() — called during form response submission ────────────────

    /**
     * Atomically increments the sequence counter and returns the formatted document number. Returns
     * null if no sequence is configured for this template.
     *
     * <p>Uses OCC retry with exponential backoff to handle concurrent form submissions.
     *
     * @param templateId the template to sequence
     * @param responseRepo the response repository — used to save documentNumber in the same TX
     * @param responseId the response to stamp
     * @param responseJson the current response JSON — will have documentNumber added
     * @param groupKey the group key (templateId) to preserve on the stamped response so it remains
     *     visible to {@code listByGroupKey}
     * @return the formatted document number, or null if unconfigured
     */
    public String nextAndStamp(
            String templateId,
            JsonBlobRepository responseRepo,
            String responseId,
            String responseJson,
            String groupKey)
            throws Exception {
        // Fast path: check if sequence is configured at all (without locking)
        Optional<String> configOpt = seqRepo.get(templateId);
        if (configOpt.isEmpty()) return null;

        JsonNode configCheck = MAPPER.readTree(configOpt.get());
        // A sequence is "configured" if it has a prefix, suffix, or explicit digits setting
        if (!configCheck.has("prefix")
                && !configCheck.has("suffix")
                && !configCheck.has("digits")) {
            return null;
        }

        Exception lastException = null;

        for (int attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
            if (attempt > 0) {
                Thread.sleep((long) Math.pow(2, attempt - 1) * INITIAL_BACKOFF_MS);
            }

            DistributedTransaction tx = null;
            try {
                tx = seqRepo.getTransactionManager().start();

                // Increment the counter and format the number within this transaction.
                String docNumber = nextNumberWithinTx(tx, templateId);
                if (docNumber == null) {
                    tx.abort();
                    return null;
                }

                // Write response with documentNumber stamped within same TX.
                // Preserve the group key so the numbered response is not dropped from
                // listByGroupKey (the group-key-less putWithinTx would null it out).
                ObjectNode respNode = (ObjectNode) MAPPER.readTree(responseJson);
                respNode.put("documentNumber", docNumber);
                responseRepo.putWithinTx(
                        tx, responseId, MAPPER.writeValueAsString(respNode), groupKey);

                tx.commit();
                log.info("Sequence stamped {} for template {}", docNumber, templateId);
                return docNumber;

            } catch (CommitConflictException | CrudConflictException e) {
                // Transient OCC conflict (read-phase CrudConflict or commit-phase
                // CommitConflict) — abort and retry with a fresh transaction.
                lastException = e;
                try {
                    if (tx != null) tx.abort();
                } catch (Exception ignored) {
                }
            } catch (Exception e) {
                // Non-transient failure (e.g. UnknownTransactionStatusException, where the
                // commit outcome is undecided and a blind retry could double-count) — rethrow.
                try {
                    if (tx != null) tx.abort();
                } catch (Exception ignored) {
                }
                throw e;
            }
        }
        throw new RuntimeException(
                "Sequence OCC conflict unresolved after " + MAX_OCC_RETRIES + " retries",
                lastException);
    }

    /**
     * Increments the sequence counter and returns the formatted document number, updating the
     * stored config <b>within the caller's transaction</b> (does NOT commit). Returns null if no
     * sequence is configured for the template. Lets a caller (e.g. status draft→issued, {@code
     * FormResponseController.updateStatus}) atomically number a document in the same transaction
     * that mutates the document, closing the read-modify-write race (#205).
     */
    public String nextNumberWithinTx(DistributedTransaction tx, String templateId)
            throws Exception {
        Optional<String> storedOpt = seqRepo.getWithinTx(tx, templateId);
        if (storedOpt.isEmpty()) return null;
        ObjectNode config = (ObjectNode) MAPPER.readTree(storedOpt.get());

        // A sequence is "configured" only if it has a prefix, suffix, or explicit digits.
        if (!config.has("prefix") && !config.has("suffix") && !config.has("digits")) {
            return null;
        }

        // Check-on-read year reset
        int currentYear = ZonedDateTime.now(JST).getYear();
        String resetOn = config.path("resetOn").asText(null);
        int storedYear = config.path("resetYear").asInt(0);
        if ("year".equals(resetOn) && storedYear < currentYear) {
            config.put("counter", 0);
            config.put("resetYear", currentYear);
        }

        int counter = config.path("counter").asInt(0) + 1;
        config.put("counter", counter);

        String prefix = config.path("prefix").asText("");
        String suffix = config.path("suffix").asText("");
        int digits = Math.max(1, config.path("digits").asInt(4));
        String docNumber = prefix + String.format("%0" + digits + "d", counter) + suffix;

        seqRepo.putWithinTx(tx, templateId, MAPPER.writeValueAsString(config));
        return docNumber;
    }

    private boolean requireAuth(Context ctx) {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ApiError.respond(
                    ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
            return false;
        }
        return true;
    }
}
