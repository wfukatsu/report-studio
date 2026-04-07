package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.Map;

/**
 * Holds the active output variant settings for a single PDF render pass.
 *
 * <p>A variant can override element visibility and apply masking rules to
 * element text/value props before rendering. Built from the {@code _variantId}
 * top-level key in the projection JSON, matched against the template's
 * {@code variants} array.
 */
public record VariantContext(
    Map<String, Boolean> visibilityOverrides,
    Map<String, MaskingSpec> maskingRules
) {

    /**
     * Masking specification for a single element.
     *
     * @param type         "hidden" | "fullReplace" | "partial"
     * @param replaceValue replacement string for fullReplace
     * @param keepFirst    number of characters to keep at the start (partial)
     * @param keepLast     number of characters to keep at the end (partial)
     */
    public record MaskingSpec(String type, String replaceValue, int keepFirst, int keepLast) {}

    /** Returns a context with no overrides and no masking rules. */
    public static VariantContext empty() {
        return new VariantContext(Map.of(), Map.of());
    }

    /**
     * Build a VariantContext from a variant JsonNode (one entry in the
     * {@code variants} array of a template).
     */
    public static VariantContext from(JsonNode variant) {
        Map<String, Boolean> vis = new HashMap<>();
        JsonNode overrides = variant.path("visibilityOverrides");
        if (overrides.isObject()) {
            overrides.fields().forEachRemaining(e -> vis.put(e.getKey(), e.getValue().asBoolean(true)));
        }

        Map<String, MaskingSpec> masks = new HashMap<>();
        JsonNode rules = variant.path("maskingRules");
        if (rules.isArray()) {
            for (JsonNode rule : rules) {
                String targetId = rule.path("targetElementId").asText(null);
                if (targetId == null || targetId.isBlank()) continue;
                String type = rule.path("maskingType").asText("hidden");
                String replace = rule.path("replaceValue").asText("");
                int keepFirst = rule.path("partialSpec").path("keepFirst").asInt(0);
                int keepLast = rule.path("partialSpec").path("keepLast").asInt(0);
                masks.put(targetId, new MaskingSpec(type, replace, keepFirst, keepLast));
            }
        }
        return new VariantContext(Map.copyOf(vis), Map.copyOf(masks));
    }

    /**
     * Returns whether the element should be visible, considering any
     * visibility override for this variant.
     *
     * @param elementId   the element's id
     * @param baseVisible the element's base visible flag
     */
    public boolean isVisible(String elementId, boolean baseVisible) {
        return visibilityOverrides.getOrDefault(elementId, baseVisible);
    }

    /**
     * Apply masking to a resolved text/value string.
     *
     * @param elementId the element's id
     * @param value     the resolved text/value (may be null)
     * @return masked value, or original if no masking rule applies
     */
    public String applyMasking(String elementId, String value) {
        MaskingSpec spec = maskingRules.get(elementId);
        if (spec == null) return value;
        return switch (spec.type()) {
            case "hidden" -> "";
            case "fullReplace" -> spec.replaceValue();
            case "partial" -> applyPartial(value, spec.keepFirst(), spec.keepLast());
            default -> value;
        };
    }

    /**
     * Apply partial masking: keep {@code keepFirst} chars at the start and
     * {@code keepLast} chars at the end; replace the middle with asterisks.
     *
     * <p>Both {@code keepFirst} and {@code keepLast} are clamped so that their
     * sum never exceeds the string length (acceptance criterion #5).
     */
    private static String applyPartial(String value, int keepFirst, int keepLast) {
        if (value == null) return "";
        int len = value.length();
        int clampedFirst = Math.min(keepFirst, len);
        int clampedLast = Math.min(keepLast, Math.max(0, len - clampedFirst));
        String prefix = value.substring(0, clampedFirst);
        String suffix = clampedLast > 0 ? value.substring(len - clampedLast) : "";
        int maskLen = Math.max(0, len - clampedFirst - clampedLast);
        return prefix + "*".repeat(maskLen) + suffix;
    }
}
