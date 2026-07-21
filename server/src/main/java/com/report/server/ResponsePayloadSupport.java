package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

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

    static List<String> buildSummary(JsonNode data) {
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
