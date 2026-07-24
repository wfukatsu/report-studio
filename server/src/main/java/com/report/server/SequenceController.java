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
import java.util.Map;
import java.util.Optional;

/**
 * Document auto-numbering (自動採番) config endpoints per template.
 *
 * <ul>
 *   <li>GET /api/v1/sequences/{templateId} — get config
 *   <li>PUT /api/v1/sequences/{templateId} — update config
 * </ul>
 *
 * <p>The atomic sequence increment itself (nextAndStamp / nextNumberWithinTx) lives in {@link
 * DocumentNumberService} (#419), shared with the form-response submit flow.
 */
public final class SequenceController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
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
