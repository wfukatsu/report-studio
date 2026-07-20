package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.exception.transaction.CommitConflictException;
import com.scalar.db.exception.transaction.CrudConflictException;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles V2 form response CRUD endpoints:
 *
 * <ul>
 *   <li>POST /api/v2/templates/{id}/responses — submit response (rate-limited)
 *   <li>GET /api/v2/templates/{id}/responses — list responses with pagination
 *   <li>GET /api/v2/templates/{id}/responses/{rid} — get single response
 *   <li>DELETE /api/v2/templates/{id}/responses/{rid} — delete (owner or submitter only)
 * </ul>
 *
 * <p>Security:
 *
 * <ul>
 *   <li>All endpoints require authentication (enforced by auth before-filter in ApiRoutes)
 *   <li>{@code submittedBy} is always set server-side — never accepted from the client
 *   <li>Template ownership is verified before submit/list/get/delete
 *   <li>Delete requires ownership of the template OR the response itself
 * </ul>
 */
public final class FormResponseController {

    private static final Logger log = LoggerFactory.getLogger(FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 500;

    /** Inline listing is capped; above this threshold, use the export endpoint. */
    private static final int MAX_INLINE_RESPONSES = 2_000;

    /** Aggregation is capped to prevent memory issues. */
    private static final int MAX_AGG_RESPONSES = 5_000;

    private static final int SUMMARY_FIELD_COUNT = 3;
    private static final int MAX_NEST_DEPTH = 8;

    /** Document lifecycle statuses (#163). draft → issued → sent, or void at any point. */
    static final String DEFAULT_STATUS = "issued";

    static final java.util.Set<String> VALID_STATUSES =
            java.util.Set.of("draft", "issued", "sent", "void");

    /**
     * Allowed document-lifecycle transitions (#205). A status may advance draft → issued → sent,
     * and any non-terminal status may be voided; {@code void} is terminal. Any other transition
     * (e.g. void → issued, sent → draft) is rejected with 409 so a status machine cannot be driven
     * backwards or resurrected. A same-status "transition" is treated as an idempotent no-op, not
     * an error.
     */
    private static final Map<String, Set<String>> ALLOWED_TRANSITIONS =
            Map.of(
                    "draft", Set.of("issued", "void"),
                    "issued", Set.of("sent", "void"),
                    "sent", Set.of("void"),
                    "void", Set.of());

    static boolean isValidTransition(String from, String to) {
        if (from == null || from.equals(to)) return true; // no-op / first assignment
        return ALLOWED_TRANSITIONS.getOrDefault(from, Set.of()).contains(to);
    }

    private final JsonBlobRepository responseRepo;
    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter submitLimiter;
    private SequenceController sequenceCtrl; // injected lazily
    private WebhookController webhookCtrl; // injected lazily
    private java.util.concurrent.ExecutorService webhookExecutor;
    private StatusAuditRepository statusAuditRepo; // injected lazily (#188)

    public FormResponseController(
            JsonBlobRepository responseRepo,
            JsonBlobRepository definitionsRepo,
            RateLimiter submitLimiter) {
        this.responseRepo = responseRepo;
        this.definitionsRepo = definitionsRepo;
        this.submitLimiter = submitLimiter;
    }

    /** Inject sequence controller after construction (avoids circular dependency). */
    public void setSequenceController(SequenceController ctrl) {
        this.sequenceCtrl = ctrl;
    }

    /** Inject the status-transition audit store after construction (#188). */
    public void setStatusAuditRepository(StatusAuditRepository repo) {
        this.statusAuditRepo = repo;
    }

    /** Inject webhook controller after construction. */
    public void setWebhookController(
            WebhookController ctrl, java.util.concurrent.ExecutorService executor) {
        this.webhookCtrl = ctrl;
        this.webhookExecutor = executor;
    }

    // ── submit ────────────────────────────────────────────────────────────────

    /** POST /api/v2/templates/{id}/responses */
    public void submit(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        Principal principal = ctx.attribute("principal");

        // Rate limit by userId (not IP — prevents IP-rotation bypass)
        if (!submitLimiter.isAllowed(principal.userId())) {
            ctx.status(429);
            ctx.json(Map.of("error", "Too many submissions. Please wait."));
            return;
        }

        // Verify template exists and requester owns it
        Optional<JsonNode> defOpt = loadDefinitionEnvelope(templateId);
        if (defOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }
        if (!canAccess(principal, defOpt.get())) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Access denied"));
            return;
        }

        // Parse and validate request body: { data: Object }
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return;
        }
        JsonNode reqNode;
        try {
            reqNode = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }
        JsonNode data = reqNode.path("data");
        if (data.isMissingNode() || !data.isObject()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "'data' field is required and must be an object"));
            return;
        }
        if (data.size() > 1000) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Too many fields (max 1000)"));
            return;
        }
        if (hasExcessiveDepth(data, MAX_NEST_DEPTH)) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Data nesting too deep (max " + MAX_NEST_DEPTH + " levels)"));
            return;
        }

        // Build response document; submittedBy is always set server-side
        String responseId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();

        ObjectNode response = MAPPER.createObjectNode();
        response.put("id", responseId);
        response.put("templateId", templateId);
        response.set("data", data);
        response.put("submittedAt", now);
        response.put("submittedBy", principal.userId()); // server-stamped
        // Document lifecycle status (#163). A newly submitted response is "issued".
        response.put("status", DEFAULT_STATUS);

        try {
            // If sequence controller is configured, use single atomic TX (seq + response)
            if (sequenceCtrl != null) {
                String responseJson = MAPPER.writeValueAsString(response);
                String docNumber =
                        sequenceCtrl.nextAndStamp(
                                templateId, responseRepo, responseId, responseJson, templateId);
                if (docNumber == null) {
                    // No sequence configured — save response normally
                    responseRepo.put(responseId, responseJson, templateId);
                }
                // If docNumber != null, the response was saved inside the TX with documentNumber
            } else {
                responseRepo.put(responseId, MAPPER.writeValueAsString(response), templateId);
            }
        } catch (Exception e) {
            log.error("Failed to save V2 form response for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to save response"));
            return;
        }

        // Record initial issuance in the status-transition audit trail (#188)
        recordAudit(responseId, templateId, null, DEFAULT_STATUS, principal.userId());

        // Async webhook dispatch (non-blocking, failure does NOT affect response)
        if (webhookCtrl != null && webhookExecutor != null) {
            try {
                String savedJson = MAPPER.writeValueAsString(response);
                webhookCtrl.dispatchAsync(templateId, responseId, savedJson, webhookExecutor);
            } catch (Exception ignored) {
                /* webhook errors must never surface to user */
            }
        }

        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of("id", responseId, "templateId", templateId, "submittedAt", now));
        log.info(
                "Saved V2 form response {} for template {} by {}",
                responseId,
                templateId,
                principal.userId());
    }

    // ── list ─────────────────────────────────────────────────────────────────

    /** GET /api/v2/templates/{id}/responses[?offset=0&limit=50&aggregate=true] */
    public void list(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        Principal principal = ctx.attribute("principal");

        Optional<JsonNode> defOpt = loadDefinitionEnvelope(templateId);
        if (defOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }
        if (!canAccess(principal, defOpt.get())) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Access denied"));
            return;
        }

        int offset = parseIntParam(ctx.queryParam("offset"), 0);
        int limit = Math.min(parseIntParam(ctx.queryParam("limit"), DEFAULT_LIMIT), MAX_LIMIT);
        if (offset < 0) offset = 0;
        boolean includeAggregation = "true".equals(ctx.queryParam("aggregate"));
        // Optional status filter (#172): ?status=draft|issued|sent|void
        String statusFilter = ctx.queryParam("status");
        if (statusFilter != null && !VALID_STATUSES.contains(statusFilter)) statusFilter = null;

        List<String> allJson;
        try {
            allJson = responseRepo.listByGroupKey(templateId);
        } catch (Exception e) {
            log.error("Failed to list V2 responses for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to list responses"));
            return;
        }

        // Guard: above threshold, direct to export endpoint
        if (allJson.size() > MAX_INLINE_RESPONSES) {
            ctx.status(422);
            ctx.json(
                    Map.of(
                            "error",
                            "Too many responses for inline listing. Use the export endpoint.",
                            "total",
                            allJson.size()));
            return;
        }

        // Map id → status from the raw JSON (status isn't carried on ResponseEntry).
        // Legacy responses saved before #163 have no status → treated as DEFAULT_STATUS.
        Map<String, String> statusById = new HashMap<>();
        for (String json : allJson) {
            try {
                JsonNode n = MAPPER.readTree(json);
                statusById.put(n.path("id").asText(), n.path("status").asText(DEFAULT_STATUS));
            } catch (Exception ignored) {
                /* skip unparseable */
            }
        }

        // Parse, optionally filter by status (#172), and sort by submittedAt descending
        final String finalStatusFilter = statusFilter;
        List<V2ResponseAggregator.ResponseEntry> entries =
                allJson.stream()
                        .map(this::parseToEntry)
                        .filter(Objects::nonNull)
                        .filter(
                                e ->
                                        finalStatusFilter == null
                                                || finalStatusFilter.equals(
                                                        statusById.getOrDefault(
                                                                e.id(), DEFAULT_STATUS)))
                        .sorted(
                                Comparator.comparingLong(
                                                V2ResponseAggregator.ResponseEntry::submittedAt)
                                        .reversed())
                        .toList();

        int total = entries.size();
        int fromIndex = Math.min(offset, total);
        int toIndex = Math.min(fromIndex + limit, total);
        List<V2ResponseAggregator.ResponseEntry> page = entries.subList(fromIndex, toIndex);

        // Build response items (summary only in list view)
        List<Map<String, Object>> items = new ArrayList<>();
        for (var entry : page) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", entry.id());
            item.put("templateId", entry.templateId());
            item.put("submittedAt", entry.submittedAt());
            item.put("submittedBy", entry.submittedBy());
            item.put("status", statusById.getOrDefault(entry.id(), DEFAULT_STATUS));
            item.put("summary", buildSummary(entry.data()));
            items.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("total", total);
        result.put("offset", offset);
        result.put("limit", limit);
        result.put("hasMore", offset + limit < total);

        if (includeAggregation) {
            int aggLimit = Math.min(total, MAX_AGG_RESPONSES);
            result.put("fieldSummary", V2ResponseAggregator.build(entries.subList(0, aggLimit)));
            result.put("aggregationTruncated", total > MAX_AGG_RESPONSES);
        }

        ctx.json(result);
    }

    // ── get ───────────────────────────────────────────────────────────────────

    /** GET /api/v2/templates/{id}/responses/{rid} */
    public void get(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        String responseId = RequestValidator.validateId(ctx, "rid");
        if (templateId == null || responseId == null) return;

        Principal principal = ctx.attribute("principal");

        Optional<JsonNode> defOpt = loadDefinitionEnvelope(templateId);
        if (defOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }
        if (!canAccess(principal, defOpt.get())) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Access denied"));
            return;
        }

        Optional<String> stored = responseRepo.get(responseId);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        // Verify the response belongs to this template
        try {
            JsonNode node = MAPPER.readTree(stored.get());
            if (!templateId.equals(node.path("templateId").asText(""))) {
                ctx.status(HttpStatus.NOT_FOUND);
                ctx.json(Map.of("error", "Response not found"));
                return;
            }
            ctx.contentType("application/json");
            ctx.result(stored.get());
        } catch (Exception e) {
            log.error("Failed to parse V2 response {}", responseId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to retrieve response"));
        }
    }

    // ── delete ────────────────────────────────────────────────────────────────

    /** DELETE /api/v2/templates/{id}/responses/{rid} */
    public void delete(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        String responseId = RequestValidator.validateId(ctx, "rid");
        if (templateId == null || responseId == null) return;

        Principal principal = ctx.attribute("principal");

        Optional<String> stored = responseRepo.get(responseId);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        JsonNode node;
        try {
            node = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read response"));
            return;
        }

        // Verify response belongs to this template (return 404 to prevent enumeration)
        if (!templateId.equals(node.path("templateId").asText(""))) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        // Allow: template owner OR original submitter
        String submittedBy = node.path("submittedBy").asText("");
        String templateOwner = getTemplateOwner(templateId);
        boolean isSubmitter = principal.userId().equals(submittedBy);
        boolean isOwner = !templateOwner.isEmpty() && principal.userId().equals(templateOwner);

        if (!isSubmitter && !isOwner) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Access denied"));
            return;
        }

        // Only report success if the delete actually committed (issue #206).
        try {
            responseRepo.delete(responseId);
        } catch (Exception e) {
            log.warn("Response deletion failed for id={}: {}", responseId, e.getMessage());
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to delete response"));
            return;
        }
        ctx.json(Map.of("deleted", true, "id", responseId));
    }

    // ── status (#163) ──────────────────────────────────────────────────────────

    /**
     * PATCH /api/v2/templates/{id}/responses/{rid}/status Body: {@code {"status":
     * "draft"|"issued"|"sent"|"void"}}
     *
     * <p>Updates the document lifecycle status of an issued report. Same access rule as delete:
     * template owner or original submitter.
     */
    public void updateStatus(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        String responseId = RequestValidator.validateId(ctx, "rid");
        if (templateId == null || responseId == null) return;

        Principal principal = ctx.attribute("principal");

        String newStatus;
        try {
            JsonNode body = MAPPER.readTree(ctx.body());
            newStatus = body.path("status").asText("");
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }
        if (!VALID_STATUSES.contains(newStatus)) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid status. Allowed: " + VALID_STATUSES));
            return;
        }

        // Template ownership is invariant across the operation — resolve it once.
        String templateOwner = getTemplateOwner(templateId);

        // Read-validate-write in a single transaction with OCC retry (#205): the transition
        // is validated against the status re-read inside the transaction, so two concurrent
        // PATCHes (or a PATCH racing a data edit) can no longer lose an update or drive the
        // status machine backwards. Document numbering (draft→issued) happens in the same TX.
        for (int attempt = 0; attempt < STATUS_MAX_OCC_RETRIES; attempt++) {
            if (attempt > 0) sleepBackoff(attempt);
            DistributedTransaction tx = null;
            try {
                tx = responseRepo.getTransactionManager().start();

                Optional<String> storedOpt = responseRepo.getWithinTx(tx, responseId);
                if (storedOpt.isEmpty()) {
                    tx.abort();
                    ctx.status(HttpStatus.NOT_FOUND);
                    ctx.json(Map.of("error", "Response not found"));
                    return;
                }
                ObjectNode node = (ObjectNode) MAPPER.readTree(storedOpt.get());
                if (!templateId.equals(node.path("templateId").asText(""))) {
                    tx.abort();
                    ctx.status(HttpStatus.NOT_FOUND);
                    ctx.json(Map.of("error", "Response not found"));
                    return;
                }

                // Same access rule as delete: template owner or original submitter.
                String submittedBy = node.path("submittedBy").asText("");
                boolean isSubmitter = principal.userId().equals(submittedBy);
                boolean isOwner =
                        !templateOwner.isEmpty() && principal.userId().equals(templateOwner);
                if (!isSubmitter && !isOwner) {
                    tx.abort();
                    ctx.status(HttpStatus.FORBIDDEN);
                    ctx.json(Map.of("error", "Access denied"));
                    return;
                }

                String oldStatus = node.path("status").asText(DEFAULT_STATUS);
                if (oldStatus.equals(newStatus)) {
                    // Idempotent no-op — nothing to persist or audit.
                    tx.abort();
                    Map<String, Object> noop = new LinkedHashMap<>();
                    noop.put("id", responseId);
                    noop.put("status", newStatus);
                    ctx.json(noop);
                    return;
                }
                if (!isValidTransition(oldStatus, newStatus)) {
                    tx.abort();
                    ctx.status(HttpStatus.CONFLICT);
                    ctx.json(
                            Map.of(
                                    "error",
                                    "Invalid status transition: " + oldStatus + " → " + newStatus));
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
                recordAudit(responseId, templateId, oldStatus, newStatus, principal.userId());

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
                ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
                ctx.json(Map.of("error", "Failed to update status"));
                return;
            }
        }
        // Retries exhausted under sustained contention.
        ctx.status(HttpStatus.CONFLICT);
        ctx.json(Map.of("error", "Status update conflict; please retry"));
    }

    private static final int STATUS_MAX_OCC_RETRIES = 3;
    private static final long STATUS_INITIAL_BACKOFF_MS = 20;

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

    // ── audit trail (#188) ──────────────────────────────────────────────────────

    /**
     * GET /api/v2/templates/{id}/responses/{rid}/audit Returns the status-transition history
     * (from/to/by/at), newest first.
     */
    public void getAudit(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        String responseId = RequestValidator.validateId(ctx, "rid");
        if (templateId == null || responseId == null) return;

        Principal principal = ctx.attribute("principal");

        // Access is governed by the response itself: template owner or original submitter.
        Optional<String> stored = responseRepo.get(responseId);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }
        JsonNode node;
        try {
            node = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read response"));
            return;
        }
        if (!templateId.equals(node.path("templateId").asText(""))) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }
        String submittedBy = node.path("submittedBy").asText("");
        String templateOwner = getTemplateOwner(templateId);
        boolean isSubmitter = principal.userId().equals(submittedBy);
        boolean isOwner = !templateOwner.isEmpty() && principal.userId().equals(templateOwner);
        if (!isSubmitter && !isOwner) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Access denied"));
            return;
        }

        List<Map<String, Object>> entries =
                statusAuditRepo == null ? List.of() : statusAuditRepo.listForResponse(responseId);
        ctx.json(Map.of("responseId", responseId, "entries", entries));
    }

    /** Append a status-transition record. Never throws — audit is best-effort. */
    private void recordAudit(
            String responseId, String templateId, String from, String to, String by) {
        if (statusAuditRepo == null) return;
        try {
            statusAuditRepo.append(responseId, templateId, from, to, by);
        } catch (Exception e) {
            log.warn(
                    "Failed to record status audit for response {}: {}",
                    responseId,
                    e.getMessage());
        }
    }

    // ── cross-template documents (#190) ─────────────────────────────────────────

    /**
     * GET /api/v2/documents[?status=&templateId=&offset=&limit=] Cross-template list of issued
     * documents (form responses). Only documents whose template the caller owns, or that the caller
     * submitted, are returned.
     */
    public void listDocuments(Context ctx) {
        Principal principal = ctx.attribute("principal");

        String statusFilter = ctx.queryParam("status");
        if (statusFilter != null && !VALID_STATUSES.contains(statusFilter)) statusFilter = null;
        String templateFilter = ctx.queryParam("templateId");
        int offset = Math.max(0, parseIntParam(ctx.queryParam("offset"), 0));
        int limit = Math.min(parseIntParam(ctx.queryParam("limit"), DEFAULT_LIMIT), MAX_LIMIT);

        List<String> allJson;
        try {
            allJson = responseRepo.list();
        } catch (Exception e) {
            log.error("Failed to list documents", e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to list documents"));
            return;
        }

        // Guard: this is a full-table scan that materialises every response across all
        // templates before filtering/sorting/paging, so heap and latency grow linearly with
        // the stored total. Cap it like the per-template listing (#208) — above the threshold,
        // the caller must narrow the query (templateId/status) or use the export endpoint.
        if (allJson.size() > MAX_INLINE_RESPONSES) {
            ctx.status(422);
            ctx.json(
                    Map.of(
                            "error",
                            "Too many documents for inline listing. Narrow by templateId/status or use export.",
                            "total",
                            allJson.size()));
            return;
        }

        // Cache template envelope lookups (owner + display name) by templateId.
        Map<String, JsonNode> envCache = new HashMap<>();
        Set<String> unknownTemplates = new HashSet<>();

        List<Map<String, Object>> items = new ArrayList<>();
        for (String json : allJson) {
            JsonNode node;
            try {
                node = MAPPER.readTree(json);
            } catch (Exception ignored) {
                continue;
            }

            String tid = node.path("templateId").asText("");
            if (tid.isEmpty()) continue;
            if (templateFilter != null && !templateFilter.equals(tid)) continue;
            if (unknownTemplates.contains(tid)) continue;

            String status = node.path("status").asText(DEFAULT_STATUS);
            if (statusFilter != null && !statusFilter.equals(status)) continue;

            JsonNode env = envCache.get(tid);
            if (env == null && !envCache.containsKey(tid)) {
                env = loadDefinitionEnvelope(tid).orElse(null);
                envCache.put(tid, env);
                if (env == null) {
                    unknownTemplates.add(tid);
                    continue;
                }
            }
            if (env == null) continue;

            // Access: template owner or original submitter (legacy owner-less templates are open).
            String createdBy = env.path("created_by").asText("");
            boolean isOwner = !createdBy.isEmpty() && principal.userId().equals(createdBy);
            boolean isSubmitter = principal.userId().equals(node.path("submittedBy").asText(""));
            if (!createdBy.isEmpty() && !isOwner && !isSubmitter) continue;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", node.path("id").asText());
            item.put("templateId", tid);
            item.put("templateName", templateDisplayName(env, tid));
            item.put("status", status);
            item.put("documentNumber", node.path("documentNumber").asText(""));
            item.put("submittedAt", node.path("submittedAt").asLong());
            item.put("submittedBy", node.path("submittedBy").asText(""));
            item.put("summary", buildSummary(node.path("data")));
            items.add(item);
        }

        items.sort(
                (a, b) ->
                        Long.compare(
                                ((Number) b.getOrDefault("submittedAt", 0L)).longValue(),
                                ((Number) a.getOrDefault("submittedAt", 0L)).longValue()));

        int total = items.size();
        int fromIndex = Math.min(offset, total);
        int toIndex = Math.min(fromIndex + limit, total);
        List<Map<String, Object>> page = items.subList(fromIndex, toIndex);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", page);
        result.put("total", total);
        result.put("offset", offset);
        result.put("limit", limit);
        result.put("hasMore", offset + limit < total);
        ctx.json(result);
    }

    /** Best-effort human-readable template name from the stored envelope. */
    private static String templateDisplayName(JsonNode env, String fallbackId) {
        String name = env.path("name").asText("");
        if (name.isEmpty()) name = env.path("definition").path("name").asText("");
        if (name.isEmpty()) name = env.path("report").path("name").asText("");
        return name.isEmpty() ? fallbackId : name;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Load the template definition envelope JSON. Returns empty if not found or malformed. */
    private Optional<JsonNode> loadDefinitionEnvelope(String templateId) {
        Optional<String> blob = definitionsRepo.get(templateId);
        if (blob.isEmpty()) return Optional.empty();
        try {
            return Optional.of(MAPPER.readTree(blob.get()));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /**
     * Check if the principal can access the template. If {@code created_by} is present, only the
     * owner can access. If absent (legacy templates without owner), access is allowed with a
     * warning log.
     */
    private boolean canAccess(Principal principal, JsonNode envelope) {
        String createdBy = envelope.path("created_by").asText("");
        if (createdBy.isEmpty()) {
            log.warn(
                    "Template {} has no createdBy — allowing access without ownership check",
                    envelope.path("id").asText("?"));
            return true;
        }
        return principal.userId().equals(createdBy);
    }

    /** Get the template owner userId, or empty string if not set. */
    private String getTemplateOwner(String templateId) {
        return loadDefinitionEnvelope(templateId)
                .map(env -> env.path("created_by").asText(""))
                .orElse("");
    }

    private V2ResponseAggregator.ResponseEntry parseToEntry(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            return new V2ResponseAggregator.ResponseEntry(
                    node.path("id").asText(),
                    node.path("templateId").asText(),
                    node.path("submittedAt").asLong(),
                    node.path("submittedBy").asText(""),
                    node.path("data"));
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> buildSummary(JsonNode data) {
        List<String> summary = new ArrayList<>();
        if (data == null || !data.isObject()) return summary;
        // Flatten nested objects to dot-notation leaves so the summary shows the
        // actual value (customer.customerName: 評価商事) instead of a raw JSON blob
        // (customer: {"customerName":"評価商事"}) — #170.
        collectLeafSummaries(data, "", summary);
        return summary;
    }

    /** Depth-first flatten of leaf (scalar) values into "a.b.c: value" lines, capped. */
    private static void collectLeafSummaries(JsonNode node, String prefix, List<String> out) {
        var fields = node.fields();
        while (fields.hasNext() && out.size() < SUMMARY_FIELD_COUNT) {
            var field = fields.next();
            String key = prefix.isEmpty() ? field.getKey() : prefix + "." + field.getKey();
            JsonNode value = field.getValue();
            if (value.isObject()) {
                collectLeafSummaries(value, key, out);
            } else {
                String text =
                        value.isTextual()
                                ? value.asText()
                                : value.isArray() ? value.size() + "件" : value.asText();
                if (text.length() > 50) text = text.substring(0, 50) + "...";
                out.add(key + ": " + text);
            }
        }
    }

    /** Recursively check nesting depth to prevent deeply nested payloads. */
    private static boolean hasExcessiveDepth(JsonNode node, int maxDepth) {
        if (maxDepth <= 0) return true;
        var it = node.fields();
        while (it.hasNext()) {
            JsonNode child = it.next().getValue();
            if (child.isContainerNode() && hasExcessiveDepth(child, maxDepth - 1)) return true;
        }
        return false;
    }

    private static int parseIntParam(String value, int defaultValue) {
        if (value == null || value.isBlank()) return defaultValue;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
