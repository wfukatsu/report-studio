package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.*;

/**
 * Aggregates V2 form response data into per-field summaries.
 *
 * <p>For each field key found across all responses, computes:
 * <ul>
 *   <li>{@code count} — number of responses that have a non-null value for this field</li>
 *   <li>{@code topValues} — up to 5 most frequent values for the field</li>
 * </ul>
 *
 * <p>Usage: pass up to 5000 {@link ResponseEntry} items (enforced by caller).
 * This class is stateless and has no side effects.
 */
public final class V2ResponseAggregator {

    private static final int TOP_VALUES_LIMIT = 5;
    private static final int MAX_VALUE_LENGTH = 100; // truncate long values

    private V2ResponseAggregator() {}

    /**
     * Aggregate field statistics from a list of response entries.
     *
     * @param entries list of parsed form responses (caller enforces max 5000)
     * @return map of fieldKey → {count, topValues}
     */
    public static Map<String, FieldSummary> build(List<ResponseEntry> entries) {
        // fieldKey → (value → frequency)
        Map<String, Map<String, Integer>> freqMap = new LinkedHashMap<>();

        for (ResponseEntry entry : entries) {
            JsonNode data = entry.data();
            if (data == null || !data.isObject()) continue;

            var fields = data.fields();
            while (fields.hasNext()) {
                var field = fields.next();
                String key = field.getKey();
                JsonNode valueNode = field.getValue();
                if (valueNode.isNull()) continue;

                String value = toDisplayString(valueNode);
                freqMap.computeIfAbsent(key, k -> new LinkedHashMap<>())
                       .merge(value, 1, Integer::sum);
            }
        }

        Map<String, FieldSummary> result = new LinkedHashMap<>();
        for (var entry : freqMap.entrySet()) {
            String key = entry.getKey();
            Map<String, Integer> freq = entry.getValue();
            int count = freq.values().stream().mapToInt(Integer::intValue).sum();
            List<Object> topValues = freq.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(TOP_VALUES_LIMIT)
                .map(e -> (Object) e.getKey())
                .toList();
            result.put(key, new FieldSummary(count, topValues));
        }
        return result;
    }

    private static String toDisplayString(JsonNode node) {
        String raw = node.isTextual() ? node.asText() : node.toString();
        return raw.length() > MAX_VALUE_LENGTH ? raw.substring(0, MAX_VALUE_LENGTH) + "…" : raw;
    }

    /** Summary for a single field across all responses. */
    public record FieldSummary(int count, List<Object> topValues) {}

    /** Parsed form response, used as input to aggregation. */
    public record ResponseEntry(
            String id,
            String templateId,
            long submittedAt,
            String submittedBy,
            JsonNode data
    ) {}
}
