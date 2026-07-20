package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.util.Map;

/**
 * Merges a data row into a projection JSON by resolving bindingRef values.
 *
 * <p>For each element with a {@code bindingRef}, looks up the corresponding value in the data row
 * and injects it into the appropriate prop (text, value, checked, selected).
 *
 * <p>Deep-copies the projection once at the root level, then mutates in place. This avoids triple
 * deep-copy (template → section → element) for O(1) copies per merge.
 */
public final class ProjectionMerger {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ProjectionMerger() {}

    /**
     * Merge a data row into a projection JSON.
     *
     * @param projectionJson the raw projection JSON (with templates array)
     * @param row column values keyed by bindingRef path
     * @return a new projection JSON with all matching bindingRefs resolved
     */
    public static String merge(String projectionJson, Map<String, String> row) throws IOException {
        // Single deep copy at root — all subsequent mutations operate on this copy
        ObjectNode root = (ObjectNode) MAPPER.readTree(projectionJson).deepCopy();
        JsonNode templates = root.get("templates");

        if (templates != null && templates.isArray()) {
            for (JsonNode tmpl : templates) {
                if (tmpl.isObject()) {
                    mergeTemplateInPlace((ObjectNode) tmpl, row);
                }
            }
        }

        // Remove _formData if present — merged projection is self-contained
        root.remove("_formData");

        return MAPPER.writeValueAsString(root);
    }

    private static void mergeTemplateInPlace(ObjectNode tmpl, Map<String, String> row) {
        JsonNode sections = tmpl.get("sections");
        if (sections == null || !sections.isArray()) return;

        for (JsonNode section : sections) {
            if (section.isObject()) {
                mergeSectionInPlace((ObjectNode) section, row);
            }
        }
    }

    private static void mergeSectionInPlace(ObjectNode section, Map<String, String> row) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;

        ArrayNode mergedElements = MAPPER.createArrayNode();
        for (JsonNode el : elements) {
            mergedElements.add(mergeElementInPlace(el, row));
        }
        section.set("elements", mergedElements);
    }

    private static JsonNode mergeElementInPlace(JsonNode el, Map<String, String> row) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode == null || !bindingRefNode.isTextual()) {
            return el;
        }

        String ref = bindingRefNode.asText();

        // Skip system variables like {currentDate}
        if (ref.startsWith("{")) {
            return el;
        }

        // Look up value in data row (handles both master "group.field" and detail "group[].field")
        String value = row.get(ref);
        if (value == null) {
            return el;
        }

        // Determine which prop to set based on element kind
        String kind = el.has("kind") ? el.get("kind").asText() : "";
        String propKey =
                switch (kind) {
                    case "checkbox" -> "checked";
                    case "radio_mark" -> "selected";
                    case "barcode", "qrcode" -> "value";
                    default -> "text";
                };

        // Mutate in place — safe because root was already deep-copied
        ObjectNode elNode = (ObjectNode) el;
        ObjectNode props =
                elNode.has("props") && elNode.get("props").isObject()
                        ? (ObjectNode) elNode.get("props")
                        : MAPPER.createObjectNode();
        props.put(propKey, value);
        elNode.set("props", props);
        return elNode;
    }
}
