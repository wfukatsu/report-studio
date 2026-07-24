package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
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
 *
 * <p>The controller keeps the 7 HTTP handlers thin and delegates the logic clusters to
 * package-local collaborators (#276): {@link ResponseSubmissionValidator} (submit body validation),
 * {@link ResponseStatusPolicy} (status machine), {@link ResponseStatusUpdater} (transactional
 * status transition + audit wiring), {@link TemplateAccessPolicy} (envelope loading / ownership),
 * {@link IssuedDocumentQuery} (cross-template document listing), and {@link ResponsePayloadSupport}
 * (limits, summaries, param parsing).
 *
 * <p>The submit flow orchestrates document numbering, status audit, and webhook notification
 * through constructor-injected services (#419): {@link DocumentNumberService} (atomic 採番 TX),
 * {@link StatusAuditRepository} (best-effort transition trail), and {@link WebhookDispatchService}
 * (async fire-and-forget dispatch).
 */
public final class FormResponseController {

    private static final Logger log = LoggerFactory.getLogger(FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Document lifecycle statuses (#163). draft → issued → sent, or void at any point. */
    static final String DEFAULT_STATUS = ResponseStatusPolicy.DEFAULT_STATUS;

    static final java.util.Set<String> VALID_STATUSES = ResponseStatusPolicy.VALID_STATUSES;

    static boolean isValidTransition(String from, String to) {
        return ResponseStatusPolicy.isValidTransition(from, to);
    }

    private final JsonBlobRepository responseRepo;
    private final RateLimiter submitLimiter;
    private final TemplateAccessPolicy accessPolicy;
    private final IssuedDocumentQuery documentQuery;
    private final DocumentNumberService documentNumbers;
    private final WebhookDispatchService webhookDispatch;
    private final StatusAuditRepository statusAuditRepo;

    public FormResponseController(
            JsonBlobRepository responseRepo,
            JsonBlobRepository definitionsRepo,
            RateLimiter submitLimiter,
            DocumentNumberService documentNumbers,
            WebhookDispatchService webhookDispatch,
            StatusAuditRepository statusAuditRepo) {
        this.responseRepo = responseRepo;
        this.submitLimiter = submitLimiter;
        this.accessPolicy = new TemplateAccessPolicy(definitionsRepo);
        this.documentQuery = new IssuedDocumentQuery(responseRepo, accessPolicy);
        this.documentNumbers = documentNumbers;
        this.webhookDispatch = webhookDispatch;
        this.statusAuditRepo = statusAuditRepo;
    }

    // ── submit ────────────────────────────────────────────────────────────────

    /** POST /api/v2/templates/{id}/responses */
    public void submit(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        Principal principal = ctx.attribute("principal");

        // Rate limit by userId (not IP — prevents IP-rotation bypass)
        if (!submitLimiter.isAllowed(principal.userId())) {
            ApiError.respond(ctx, 429, "RATE_LIMITED", "Too many submissions. Please wait.");
            return;
        }

        // Verify template exists and requester owns it
        Optional<JsonNode> defOpt = accessPolicy.loadDefinitionEnvelope(templateId);
        if (defOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }
        if (!accessPolicy.canAccess(principal, defOpt.get())) {
            ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
            return;
        }

        // Parse and validate request body: { data: Object }
        JsonNode data = ResponseSubmissionValidator.parseAndValidateData(ctx);
        if (data == null) return;

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
            // Single atomic TX (seq + response) when the template has a sequence configured
            String responseJson = MAPPER.writeValueAsString(response);
            String docNumber =
                    documentNumbers.nextAndStamp(
                            templateId, responseRepo, responseId, responseJson, templateId);
            if (docNumber == null) {
                // No sequence configured — save response normally
                responseRepo.put(responseId, responseJson, templateId);
            }
            // If docNumber != null, the response was saved inside the TX with documentNumber
        } catch (Exception e) {
            log.error("Failed to save V2 form response for template {}", templateId, e);
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to save response");
            return;
        }

        // Record initial issuance in the status-transition audit trail (#188)
        recordAudit(responseId, templateId, null, DEFAULT_STATUS, principal.userId());

        // Async webhook dispatch (non-blocking, failure does NOT affect response)
        try {
            String savedJson = MAPPER.writeValueAsString(response);
            webhookDispatch.dispatchAsync(templateId, responseId, savedJson);
        } catch (Exception ignored) {
            /* webhook errors must never surface to user */
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

        Optional<JsonNode> defOpt = accessPolicy.loadDefinitionEnvelope(templateId);
        if (defOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }
        if (!accessPolicy.canAccess(principal, defOpt.get())) {
            ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
            return;
        }

        int offset = ResponsePayloadSupport.parseIntParam(ctx.queryParam("offset"), 0);
        int limit =
                Math.min(
                        ResponsePayloadSupport.parseIntParam(
                                ctx.queryParam("limit"), ResponsePayloadSupport.DEFAULT_LIMIT),
                        ResponsePayloadSupport.MAX_LIMIT);
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
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to list responses");
            return;
        }

        // Guard: above threshold, direct to export endpoint
        if (allJson.size() > ResponsePayloadSupport.MAX_INLINE_RESPONSES) {
            ApiError.respond(
                    ctx,
                    422,
                    "VALIDATION_ERROR",
                    "Too many responses for inline listing. Use the export endpoint.",
                    Map.of("total", allJson.size()));
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
            List<Map<String, Object>> summaryItems =
                    ResponsePayloadSupport.buildSummaryItems(entry.data());
            item.put("summary", ResponsePayloadSupport.summaryLines(summaryItems));
            item.put("summaryItems", summaryItems);
            items.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("total", total);
        result.put("offset", offset);
        result.put("limit", limit);
        result.put("hasMore", offset + limit < total);

        if (includeAggregation) {
            int aggLimit = Math.min(total, ResponsePayloadSupport.MAX_AGG_RESPONSES);
            result.put("fieldSummary", V2ResponseAggregator.build(entries.subList(0, aggLimit)));
            result.put("aggregationTruncated", total > ResponsePayloadSupport.MAX_AGG_RESPONSES);
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

        Optional<JsonNode> defOpt = accessPolicy.loadDefinitionEnvelope(templateId);
        if (defOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }
        if (!accessPolicy.canAccess(principal, defOpt.get())) {
            ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
            return;
        }

        Optional<String> stored = responseRepo.get(responseId);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
            return;
        }

        // Verify the response belongs to this template
        try {
            JsonNode node = MAPPER.readTree(stored.get());
            if (!templateId.equals(node.path("templateId").asText(""))) {
                ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
                return;
            }
            ctx.contentType("application/json");
            ctx.result(stored.get());
        } catch (Exception e) {
            log.error("Failed to parse V2 response {}", responseId, e);
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to retrieve response");
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
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
            return;
        }

        JsonNode node;
        try {
            node = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to read response");
            return;
        }

        // Verify response belongs to this template (return 404 to prevent enumeration)
        if (!templateId.equals(node.path("templateId").asText(""))) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
            return;
        }

        // Allow: template owner OR original submitter
        String submittedBy = node.path("submittedBy").asText("");
        String templateOwner = accessPolicy.getTemplateOwner(templateId);
        boolean isSubmitter = principal.userId().equals(submittedBy);
        boolean isOwner = !templateOwner.isEmpty() && principal.userId().equals(templateOwner);

        if (!isSubmitter && !isOwner) {
            ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
            return;
        }

        // Only report success if the delete actually committed (issue #206).
        try {
            responseRepo.delete(responseId);
        } catch (Exception e) {
            log.warn("Response deletion failed for id={}: {}", responseId, e.getMessage());
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to delete response");
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
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }
        if (!VALID_STATUSES.contains(newStatus)) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Invalid status. Allowed: " + VALID_STATUSES);
            return;
        }

        // Template ownership is invariant across the operation — resolve it once.
        String templateOwner = accessPolicy.getTemplateOwner(templateId);

        ResponseStatusUpdater.update(
                ctx,
                responseRepo,
                documentNumbers,
                this::recordAudit,
                templateId,
                responseId,
                principal,
                newStatus,
                templateOwner);
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
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
            return;
        }
        JsonNode node;
        try {
            node = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to read response");
            return;
        }
        if (!templateId.equals(node.path("templateId").asText(""))) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Response not found");
            return;
        }
        String submittedBy = node.path("submittedBy").asText("");
        String templateOwner = accessPolicy.getTemplateOwner(templateId);
        boolean isSubmitter = principal.userId().equals(submittedBy);
        boolean isOwner = !templateOwner.isEmpty() && principal.userId().equals(templateOwner);
        if (!isSubmitter && !isOwner) {
            ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
            return;
        }

        List<Map<String, Object>> entries = statusAuditRepo.listForResponse(responseId);
        ctx.json(Map.of("responseId", responseId, "entries", entries));
    }

    /** Append a status-transition record. Never throws — audit is best-effort. */
    private void recordAudit(
            String responseId, String templateId, String from, String to, String by) {
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
        documentQuery.list(ctx, principal);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
}
