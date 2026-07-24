package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Cross-template issued-documents listing (#190): filtering, access checks, and page assembly.
 * Extracted from FormResponseController (#276) — no behavior change (logs keep the
 * FormResponseController category).
 */
final class IssuedDocumentQuery {

    private static final Logger log = LoggerFactory.getLogger(FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JsonBlobRepository responseRepo;
    private final TemplateAccessPolicy accessPolicy;

    IssuedDocumentQuery(JsonBlobRepository responseRepo, TemplateAccessPolicy accessPolicy) {
        this.responseRepo = responseRepo;
        this.accessPolicy = accessPolicy;
    }

    /**
     * List issued documents across templates, optionally filtered by status/templateId. Only
     * documents whose template the caller owns, or that the caller submitted, are returned.
     */
    void list(Context ctx, Principal principal) {
        String statusFilter = ctx.queryParam("status");
        if (statusFilter != null && !ResponseStatusPolicy.VALID_STATUSES.contains(statusFilter)) {
            statusFilter = null;
        }
        String templateFilter = ctx.queryParam("templateId");
        int offset = Math.max(0, ResponsePayloadSupport.parseIntParam(ctx.queryParam("offset"), 0));
        int limit =
                Math.min(
                        ResponsePayloadSupport.parseIntParam(
                                ctx.queryParam("limit"), ResponsePayloadSupport.DEFAULT_LIMIT),
                        ResponsePayloadSupport.MAX_LIMIT);

        List<String> allJson;
        try {
            allJson = responseRepo.list();
        } catch (Exception e) {
            log.error("Failed to list documents", e);
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to list documents");
            return;
        }

        // Guard: this is a full-table scan that materialises every response across all
        // templates before filtering/sorting/paging, so heap and latency grow linearly with
        // the stored total. Cap it like the per-template listing (#208) — above the threshold,
        // the caller must narrow the query (templateId/status) or use the export endpoint.
        if (allJson.size() > ResponsePayloadSupport.MAX_INLINE_RESPONSES) {
            ApiError.respond(
                    ctx,
                    422,
                    "VALIDATION_ERROR",
                    "Too many documents for inline listing. Narrow by templateId/status or use export.",
                    Map.of("total", allJson.size()));
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

            String status = node.path("status").asText(ResponseStatusPolicy.DEFAULT_STATUS);
            if (statusFilter != null && !statusFilter.equals(status)) continue;

            JsonNode env = envCache.get(tid);
            if (env == null && !envCache.containsKey(tid)) {
                env = accessPolicy.loadDefinitionEnvelope(tid).orElse(null);
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
            item.put("templateName", TemplateAccessPolicy.templateDisplayName(env, tid));
            item.put("status", status);
            item.put("documentNumber", node.path("documentNumber").asText(""));
            item.put("submittedAt", node.path("submittedAt").asLong());
            item.put("submittedBy", node.path("submittedBy").asText(""));
            List<Map<String, Object>> summaryItems =
                    ResponsePayloadSupport.buildSummaryItems(node.path("data"));
            item.put("summary", ResponsePayloadSupport.summaryLines(summaryItems));
            item.put("summaryItems", summaryItems);
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
}
