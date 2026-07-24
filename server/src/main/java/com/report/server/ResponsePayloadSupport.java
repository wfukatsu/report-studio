package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared response-payload helpers: listing limits, summary flattening, nesting-depth guard, and
 * query-param parsing. Extracted from FormResponseController (#276) — no behavior change.
 */
final class ResponsePayloadSupport {

    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 500;

    /** Inline listing is capped; above this threshold, use the export endpoint. */
    static final int MAX_INLINE_RESPONSES = 2_000;

    /** Aggregation is capped to prevent memory issues. */
    static final int MAX_AGG_RESPONSES = 5_000;

    static final int SUMMARY_FIELD_COUNT = 3;
    static final int MAX_NEST_DEPTH = 8;

    private ResponsePayloadSupport() {}

    /**
     * Legacy flat summary lines ("a.b.c: value"). Derived from {@link #buildSummaryItems} so both
     * shapes always agree; the ja wording ("3件" for arrays) is unchanged for backward
     * compatibility.
     */
    static List<String> buildSummary(JsonNode data) {
        return summaryLines(buildSummaryItems(data));
    }

    /**
     * Structured summary entries (#412): {@code {key, text}} for scalar leaves, {@code {key,
     * count}} for arrays. The frontend renders {@code count} entries via i18n instead of the
     * ja-only "N件" concatenation baked into {@link #buildSummary}.
     */
    static List<Map<String, Object>> buildSummaryItems(JsonNode data) {
        List<Map<String, Object>> items = new ArrayList<>();
        if (data == null || !data.isObject()) return items;
        // Flatten nested objects to dot-notation leaves so the summary shows the
        // actual value (customer.customerName: 評価商事) instead of a raw JSON blob
        // (customer: {"customerName":"評価商事"}) — #170.
        collectLeafItems(data, "", items);
        return items;
    }

    /** Renders structured entries back into the legacy "key: value" lines (ja wording). */
    static List<String> summaryLines(List<Map<String, Object>> items) {
        List<String> out = new ArrayList<>();
        for (Map<String, Object> item : items) {
            Object count = item.get("count");
            String text = (count != null) ? count + "件" : (String) item.get("text");
            out.add(item.get("key") + ": " + text);
        }
        return out;
    }

    /** Depth-first flatten of leaf (scalar) values into structured entries, capped. */
    private static void collectLeafItems(
            JsonNode node, String prefix, List<Map<String, Object>> out) {
        var fields = node.fields();
        while (fields.hasNext() && out.size() < SUMMARY_FIELD_COUNT) {
            var field = fields.next();
            String key = prefix.isEmpty() ? field.getKey() : prefix + "." + field.getKey();
            JsonNode value = field.getValue();
            if (value.isObject()) {
                collectLeafItems(value, key, out);
            } else {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("key", key);
                if (value.isArray()) {
                    item.put("count", value.size());
                } else {
                    String text = value.asText();
                    if (text.length() > 50) text = text.substring(0, 50) + "...";
                    item.put("text", text);
                }
                out.add(item);
            }
        }
    }

    /** Recursively check nesting depth to prevent deeply nested payloads. */
    static boolean hasExcessiveDepth(JsonNode node, int maxDepth) {
        if (maxDepth <= 0) return true;
        var it = node.fields();
        while (it.hasNext()) {
            JsonNode child = it.next().getValue();
            if (child.isContainerNode() && hasExcessiveDepth(child, maxDepth - 1)) return true;
        }
        return false;
    }

    static int parseIntParam(String value, int defaultValue) {
        if (value == null || value.isBlank()) return defaultValue;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
