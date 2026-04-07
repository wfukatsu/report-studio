package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * POST /api/v2/schemas/infer
 *
 * Infers a SchemaDefinition from a JSON sample.
 *
 * Input:  {"sample": {...}}  — a single JSON object representing one record
 * Output: SchemaDefinition (groups + fields) compatible with the frontend SchemaDefinition type
 *
 * Inference rules:
 *  - Top-level keys whose value is an ARRAY of objects → detail group (role="detail")
 *  - All other top-level keys → master group fields
 *  - Value types: number, boolean, string (fallback), array (nested arrays kept as "array")
 *  - Objects are treated as "string" (JSON.stringify in binding context)
 */
public final class V2SchemaInferController {

    private static final Logger log = LoggerFactory.getLogger(V2SchemaInferController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_BODY_BYTES = 1_000_000; // 1 MB
    private static final int MAX_FIELDS = 200;
    private static final int MAX_DETAIL_GROUPS = 10;

    /** POST /api/v2/schemas/infer */
    public void infer(Context ctx) {
        String body = ctx.body();
        if (body.length() > MAX_BODY_BYTES) {
            ctx.status(413);
            ctx.json(Map.of("error", "Request body too large (max 1 MB)"));
            return;
        }
        if (!RequestValidator.validateJson(ctx, body)) return;

        try {
            JsonNode root = MAPPER.readTree(body);
            JsonNode sample = root.get("sample");
            if (sample == null || !sample.isObject()) {
                ctx.status(400);
                ctx.json(Map.of("error", "\"sample\" field (object) is required"));
                return;
            }

            List<Map<String, Object>> groups = new ArrayList<>();

            // Collect master-level fields (non-array keys)
            List<Map<String, Object>> masterFields = new ArrayList<>();

            // Collect detail groups (array-of-object keys)
            List<Map<String, Object>> detailGroups = new ArrayList<>();

            Iterator<Map.Entry<String, JsonNode>> fields = sample.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String key = entry.getKey();
                JsonNode value = entry.getValue();

                if (value.isArray() && !value.isEmpty() && value.get(0).isObject()) {
                    // Detail group — array of objects
                    if (detailGroups.size() < MAX_DETAIL_GROUPS) {
                        detailGroups.add(buildDetailGroup(key, value));
                    }
                } else {
                    // Master field
                    if (masterFields.size() < MAX_FIELDS) {
                        masterFields.add(buildField(key, value));
                    }
                }
            }

            // Build master group if there are any master fields
            if (!masterFields.isEmpty()) {
                Map<String, Object> masterGroup = new LinkedHashMap<>();
                masterGroup.put("id", "grp-" + UUID.randomUUID());
                masterGroup.put("label", "マスター");
                masterGroup.put("role", "master");
                masterGroup.put("dataKey", "");
                masterGroup.put("fields", masterFields);
                groups.add(masterGroup);
            }

            groups.addAll(detailGroups);

            ctx.json(Map.of("groups", groups));
            log.info("Inferred schema: {} groups, {} master fields, {} detail groups",
                    groups.size(), masterFields.size(), detailGroups.size());

        } catch (Exception e) {
            log.error("Schema inference failed", e);
            ctx.status(500);
            ctx.json(Map.of("error", "Schema inference failed"));
        }
    }

    // ---------------------------------------------------------------------------

    private Map<String, Object> buildDetailGroup(String key, JsonNode array) {
        // Collect all distinct field keys from the first few rows
        Map<String, JsonNode> seenFields = new LinkedHashMap<>();
        int rowsToScan = Math.min(array.size(), 5);
        for (int i = 0; i < rowsToScan; i++) {
            JsonNode row = array.get(i);
            if (!row.isObject()) continue;
            row.fields().forEachRemaining(e -> seenFields.putIfAbsent(e.getKey(), e.getValue()));
        }

        List<Map<String, Object>> detailFields = new ArrayList<>();
        for (Map.Entry<String, JsonNode> e : seenFields.entrySet()) {
            if (detailFields.size() >= MAX_FIELDS) break;
            detailFields.add(buildField(e.getKey(), e.getValue()));
        }

        Map<String, Object> group = new LinkedHashMap<>();
        group.put("id", "grp-" + UUID.randomUUID());
        group.put("label", key);
        group.put("role", "detail");
        group.put("dataKey", key);
        group.put("fields", detailFields);
        return group;
    }

    private Map<String, Object> buildField(String key, JsonNode value) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("id", "fld-" + UUID.randomUUID());
        field.put("key", key);
        field.put("label", key);
        field.put("type", inferType(value));
        return field;
    }

    private String inferType(JsonNode value) {
        if (value.isNumber()) return "number";
        if (value.isBoolean()) return "boolean";
        if (value.isArray()) return "array";
        return "string"; // covers text, null, objects
    }
}
