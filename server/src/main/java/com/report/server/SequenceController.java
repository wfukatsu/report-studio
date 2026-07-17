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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.Optional;

/**
 * Document auto-numbering (自動採番) per template.
 *
 * <ul>
 *   <li>GET  /api/v1/sequences/{templateId}   — get config</li>
 *   <li>PUT  /api/v1/sequences/{templateId}   — update config</li>
 * </ul>
 *
 * <p>Sequence increment is done atomically within a single ScalarDB
 * DistributedTransaction (read-then-write) with OCC retry.
 * The {@code {{documentNumber}}} token is inserted into form responses at submission time.
 */
public final class SequenceController {

    private static final Logger log = LoggerFactory.getLogger(SequenceController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");
    private static final int MAX_OCC_RETRIES = 5;
    private static final long INITIAL_BACKOFF_MS = 50;

    private final JsonBlobRepository seqRepo;

    public SequenceController(JsonBlobRepository seqRepo) {
        this.seqRepo = seqRepo;
    }

    // ── GET /api/v1/sequences/{templateId} ───────────────────────────────────

    public void getConfig(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx, "templateId");
        if (templateId == null) return;

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

        JsonNode req;
        try { req = MAPPER.readTree(ctx.body()); }
        catch (Exception e) { ctx.status(HttpStatus.BAD_REQUEST); ctx.json(Map.of("error","Invalid JSON")); return; }

        // Read existing or create new
        Optional<String> stored = seqRepo.get(templateId);
        ObjectNode config = stored.isPresent()
                ? (ObjectNode) MAPPER.readTree(stored.get())
                : MAPPER.createObjectNode();

        if (req.has("prefix"))   config.put("prefix",   req.path("prefix").asText(""));
        if (req.has("suffix"))   config.put("suffix",   req.path("suffix").asText(""));
        if (req.has("digits"))   config.put("digits",   Math.max(1, Math.min(10, req.path("digits").asInt(4))));
        if (req.has("resetOn")) {
            String resetOn = req.path("resetOn").asText(null);
            if ("year".equals(resetOn)) config.put("resetOn", "year");
            else config.putNull("resetOn");
        }
        if (!config.has("counter")) config.put("counter", 0);
        if (!config.has("resetYear")) config.put("resetYear", 0);

        seqRepo.put(templateId, MAPPER.writeValueAsString(config));
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(config));
    }

    // ── Atomic next() — called during form response submission ────────────────

    /**
     * Atomically increments the sequence counter and returns the formatted document number.
     * Returns null if no sequence is configured for this template.
     *
     * <p>Uses OCC retry with exponential backoff to handle concurrent form submissions.
     *
     * @param templateId the template to sequence
     * @param responseRepo the response repository — used to save documentNumber in the same TX
     * @param responseId the response to stamp
     * @param responseJson the current response JSON — will have documentNumber added
     * @return the formatted document number, or null if unconfigured
     */
    public String nextAndStamp(String templateId,
                                JsonBlobRepository responseRepo,
                                String responseId,
                                String responseJson) throws Exception {
        // Fast path: check if sequence is configured at all (without locking)
        Optional<String> configOpt = seqRepo.get(templateId);
        if (configOpt.isEmpty()) return null;

        JsonNode configCheck = MAPPER.readTree(configOpt.get());
        // A sequence is "configured" if it has a prefix, suffix, or explicit digits setting
        if (!configCheck.has("prefix") && !configCheck.has("suffix") && !configCheck.has("digits")) {
            return null;
        }

        int currentYear = ZonedDateTime.now(JST).getYear();
        Exception lastException = null;

        for (int attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
            if (attempt > 0) {
                Thread.sleep((long) Math.pow(2, attempt - 1) * INITIAL_BACKOFF_MS);
            }

            DistributedTransaction tx = null;
            try {
                tx = seqRepo.getTransactionManager().start();

                // Read sequence config within transaction
                Optional<String> storedOpt = seqRepo.getWithinTx(tx, templateId);
                if (storedOpt.isEmpty()) {
                    tx.abort();
                    return null;
                }
                ObjectNode config = (ObjectNode) MAPPER.readTree(storedOpt.get());

                // Check-on-read year reset
                String resetOn = config.path("resetOn").asText(null);
                int storedYear = config.path("resetYear").asInt(0);
                if ("year".equals(resetOn) && storedYear < currentYear) {
                    config.put("counter", 0);
                    config.put("resetYear", currentYear);
                }

                int counter = config.path("counter").asInt(0) + 1;
                config.put("counter", counter);

                // Format the document number
                String prefix = config.path("prefix").asText("");
                String suffix = config.path("suffix").asText("");
                int digits = Math.max(1, config.path("digits").asInt(4));
                String docNumber = prefix + String.format("%0" + digits + "d", counter) + suffix;

                // Write updated sequence within same TX
                seqRepo.putWithinTx(tx, templateId, MAPPER.writeValueAsString(config));

                // Write response with documentNumber stamped within same TX
                ObjectNode respNode = (ObjectNode) MAPPER.readTree(responseJson);
                respNode.put("documentNumber", docNumber);
                responseRepo.putWithinTx(tx, responseId, MAPPER.writeValueAsString(respNode));

                tx.commit();
                log.info("Sequence {} → {} for template {}", counter, docNumber, templateId);
                return docNumber;

            } catch (CommitConflictException | CrudConflictException e) {
                // Transient OCC conflict (read-phase CrudConflict or commit-phase
                // CommitConflict) — abort and retry with a fresh transaction.
                lastException = e;
                try { if (tx != null) tx.abort(); } catch (Exception ignored) {}
            } catch (Exception e) {
                // Non-transient failure (e.g. UnknownTransactionStatusException, where the
                // commit outcome is undecided and a blind retry could double-count) — rethrow.
                try { if (tx != null) tx.abort(); } catch (Exception ignored) {}
                throw e;
            }
        }
        throw new RuntimeException("Sequence OCC conflict unresolved after " + MAX_OCC_RETRIES + " retries", lastException);
    }

    private boolean requireAuth(Context ctx) {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            ctx.json(Map.of("error", "Authentication required"));
            return false;
        }
        return true;
    }
}
