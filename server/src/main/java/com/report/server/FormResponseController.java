package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Handles form response submission and retrieval.
 * Stores responses as JSON blobs in ScalarDB (report_studio.form_responses).
 */
public final class FormResponseController {

    private static final Logger log = LoggerFactory.getLogger(FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final JsonBlobRepository repo;

    public FormResponseController(JsonBlobRepository repo) {
        this.repo = repo;
    }

    /** POST /api/v1/templates/{id}/responses — submit a form response */
    public void submit(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        String body = ctx.body();
        var dataNode = RequestValidator.validateResponseBody(ctx, body);
        if (dataNode == null) return;

        try {
            String responseId = "resp-" + UUID.randomUUID();
            long now = System.currentTimeMillis();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("id", responseId);
            response.put("templateId", templateId);
            response.put("data", dataNode);
            response.put("submittedAt", now);

            repo.put(responseId, MAPPER.writeValueAsString(response), templateId);

            ctx.status(HttpStatus.CREATED);
            ctx.json(Map.of("id", responseId, "templateId", templateId, "submittedAt", now));
            log.info("Saved form response {} for template {}", responseId, templateId);
        } catch (Exception e) {
            log.error("Failed to save form response for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to save response"));
        }
    }

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 500;
    private static final int SUMMARY_FIELD_COUNT = 3;

    /** GET /api/v1/templates/{id}/responses — list responses for a template */
    public void list(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        int offset = parseIntParam(ctx.queryParam("offset"), 0);
        int limit = parseIntParam(ctx.queryParam("limit"), DEFAULT_LIMIT);
        if (limit > MAX_LIMIT) limit = MAX_LIMIT;
        if (offset < 0) offset = 0;

        try {
            List<Map<String, Object>> result = new ArrayList<>();
            for (String json : repo.listByGroupKey(templateId)) {
                var node = MAPPER.readTree(json);
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", node.get("id").asText());
                entry.put("templateId", templateId);
                entry.put("submittedAt", node.get("submittedAt").asLong());
                entry.put("summary", extractSummary(node));
                result.add(entry);
            }
            result.sort(Comparator.<Map<String, Object>, Long>comparing(
                m -> (Long) m.get("submittedAt")).reversed());

            // Apply offset and limit
            int total = result.size();
            int fromIndex = Math.min(offset, total);
            int toIndex = Math.min(fromIndex + limit, total);
            List<Map<String, Object>> page = result.subList(fromIndex, toIndex);

            ctx.json(Map.of(
                "items", page,
                "total", total,
                "offset", offset,
                "limit", limit
            ));
        } catch (Exception e) {
            log.error("Failed to list responses for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to list responses"));
        }
    }

    /** Extract first N field values from response data as summary strings. */
    private static List<String> extractSummary(com.fasterxml.jackson.databind.JsonNode node) {
        List<String> summary = new ArrayList<>();
        if (!node.has("data") || !node.get("data").isObject()) {
            return summary;
        }
        var dataNode = node.get("data");
        var fields = dataNode.fields();
        int count = 0;
        while (fields.hasNext() && count < SUMMARY_FIELD_COUNT) {
            var field = fields.next();
            String value = field.getValue().isTextual()
                ? field.getValue().asText()
                : field.getValue().toString();
            // Truncate long values
            if (value.length() > 50) {
                value = value.substring(0, 50) + "...";
            }
            summary.add(field.getKey() + ": " + value);
            count++;
        }
        return summary;
    }

    private static int parseIntParam(String value, int defaultValue) {
        if (value == null || value.isBlank()) return defaultValue;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /** GET /api/v1/templates/{id}/responses/export — export all responses as CSV */
    public void export(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        try {
            List<String> jsonList = repo.listByGroupKey(templateId);
            if (jsonList.isEmpty()) {
                ctx.status(HttpStatus.NOT_FOUND);
                ctx.json(Map.of("error", "No responses found"));
                return;
            }

            // Parse all responses and collect unique data keys
            List<com.fasterxml.jackson.databind.JsonNode> nodes = new ArrayList<>();
            LinkedHashSet<String> allKeys = new LinkedHashSet<>();
            allKeys.add("id");
            allKeys.add("submittedAt");
            for (String json : jsonList) {
                var node = MAPPER.readTree(json);
                nodes.add(node);
                if (node.has("data") && node.get("data").isObject()) {
                    node.get("data").fieldNames().forEachRemaining(allKeys::add);
                }
            }

            // Sort by submittedAt descending
            nodes.sort((a, b) -> Long.compare(
                b.has("submittedAt") ? b.get("submittedAt").asLong() : 0,
                a.has("submittedAt") ? a.get("submittedAt").asLong() : 0));

            // Build CSV with BOM for Excel compatibility
            StringBuilder csv = new StringBuilder();
            csv.append('\uFEFF'); // UTF-8 BOM
            List<String> keys = new ArrayList<>(allKeys);
            csv.append(String.join(",", keys.stream().map(FormResponseController::escapeCsvField).toList()));
            csv.append("\r\n");

            for (var node : nodes) {
                var data = node.has("data") && node.get("data").isObject() ? node.get("data") : MAPPER.createObjectNode();
                for (int i = 0; i < keys.size(); i++) {
                    if (i > 0) csv.append(',');
                    String key = keys.get(i);
                    String value = switch (key) {
                        case "id" -> node.has("id") ? node.get("id").asText() : "";
                        case "submittedAt" -> node.has("submittedAt") ? String.valueOf(node.get("submittedAt").asLong()) : "";
                        default -> data.has(key) ? (data.get(key).isTextual() ? data.get(key).asText() : data.get(key).toString()) : "";
                    };
                    csv.append(escapeCsvField(value));
                }
                csv.append("\r\n");
            }

            ctx.contentType("text/csv; charset=utf-8");
            ctx.header("Content-Disposition", "attachment; filename=\"responses-" + templateId + ".csv\"");
            ctx.result(csv.toString());
        } catch (Exception e) {
            log.error("Failed to export responses for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to export responses"));
        }
    }

    private static String escapeCsvField(String value) {
        if (value == null) return "";
        // Neutralize formula injection: prefix dangerous characters with single-quote
        if (!value.isEmpty() && "=+-@\t\r".indexOf(value.charAt(0)) >= 0) {
            value = "'" + value;
        }
        if (value.contains(",") || value.contains("\n") || value.contains("\"") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    /** GET /api/v1/responses/{id} — get a single response */
    public void get(Context ctx) {
        String responseId = RequestValidator.validateId(ctx);
        if (responseId == null) return;

        var opt = repo.get(responseId);
        if (opt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }
        ctx.contentType("application/json");
        ctx.result(opt.get());
    }

    /** DELETE /api/v1/responses/{id} — delete a response */
    public void delete(Context ctx) {
        String responseId = RequestValidator.validateId(ctx);
        if (responseId == null) return;

        repo.delete(responseId);
        ctx.json(Map.of("deleted", true, "id", responseId));
    }
}
