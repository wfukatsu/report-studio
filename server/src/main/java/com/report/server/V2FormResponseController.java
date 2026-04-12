package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Handles V2 form response CRUD endpoints:
 * <ul>
 *   <li>POST   /api/v2/templates/{id}/responses        — submit response (rate-limited)</li>
 *   <li>GET    /api/v2/templates/{id}/responses        — list responses with pagination</li>
 *   <li>GET    /api/v2/templates/{id}/responses/{rid}  — get single response</li>
 *   <li>DELETE /api/v2/templates/{id}/responses/{rid}  — delete (owner or submitter only)</li>
 * </ul>
 *
 * <p>Security:
 * <ul>
 *   <li>All endpoints require authentication (enforced by auth before-filter in ApiRoutes)</li>
 *   <li>{@code submittedBy} is always set server-side — never accepted from the client</li>
 *   <li>Template ownership is verified before submit/list/get/delete</li>
 *   <li>Delete requires ownership of the template OR the response itself</li>
 * </ul>
 */
public final class V2FormResponseController {

    private static final Logger log = LoggerFactory.getLogger(V2FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 500;
    /** Inline listing is capped; above this threshold, use the export endpoint. */
    private static final int MAX_INLINE_RESPONSES = 2_000;
    /** Aggregation is capped to prevent memory issues. */
    private static final int MAX_AGG_RESPONSES = 5_000;
    private static final int SUMMARY_FIELD_COUNT = 3;
    private static final int MAX_NEST_DEPTH = 8;

    private final JsonBlobRepository responseRepo;
    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter submitLimiter;
    private SequenceController sequenceCtrl; // injected lazily
    private WebhookController webhookCtrl;   // injected lazily
    private java.util.concurrent.ExecutorService webhookExecutor;

    public V2FormResponseController(
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

    /** Inject webhook controller after construction. */
    public void setWebhookController(WebhookController ctrl, java.util.concurrent.ExecutorService executor) {
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

        try {
            // If sequence controller is configured, use single atomic TX (seq + response)
            if (sequenceCtrl != null) {
                String responseJson = MAPPER.writeValueAsString(response);
                String docNumber = sequenceCtrl.nextAndStamp(templateId, responseRepo, responseId, responseJson);
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

        // Async webhook dispatch (non-blocking, failure does NOT affect response)
        if (webhookCtrl != null && webhookExecutor != null) {
            try {
                String savedJson = MAPPER.writeValueAsString(response);
                webhookCtrl.dispatchAsync(templateId, responseId, savedJson, webhookExecutor);
            } catch (Exception ignored) { /* webhook errors must never surface to user */ }
        }

        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of("id", responseId, "templateId", templateId, "submittedAt", now));
        log.info("Saved V2 form response {} for template {} by {}", responseId, templateId, principal.userId());
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
            ctx.json(Map.of(
                "error", "Too many responses for inline listing. Use the export endpoint.",
                "total", allJson.size()
            ));
            return;
        }

        // Parse and sort by submittedAt descending
        List<V2ResponseAggregator.ResponseEntry> entries = allJson.stream()
            .map(this::parseToEntry)
            .filter(Objects::nonNull)
            .sorted(Comparator.comparingLong(V2ResponseAggregator.ResponseEntry::submittedAt).reversed())
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

        responseRepo.delete(responseId);
        ctx.json(Map.of("deleted", true, "id", responseId));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Load the template definition envelope JSON.
     * Returns empty if not found or malformed.
     */
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
     * Check if the principal can access the template.
     * If {@code created_by} is present, only the owner can access.
     * If absent (legacy templates without owner), access is allowed with a warning log.
     */
    private boolean canAccess(Principal principal, JsonNode envelope) {
        String createdBy = envelope.path("created_by").asText("");
        if (createdBy.isEmpty()) {
            log.warn("Template {} has no createdBy — allowing access without ownership check", envelope.path("id").asText("?"));
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
                node.path("data")
            );
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> buildSummary(JsonNode data) {
        List<String> summary = new ArrayList<>();
        if (data == null || !data.isObject()) return summary;
        var fields = data.fields();
        int count = 0;
        while (fields.hasNext() && count < SUMMARY_FIELD_COUNT) {
            var field = fields.next();
            String value = field.getValue().isTextual()
                ? field.getValue().asText()
                : field.getValue().toString();
            if (value.length() > 50) value = value.substring(0, 50) + "...";
            summary.add(field.getKey() + ": " + value);
            count++;
        }
        return summary;
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
