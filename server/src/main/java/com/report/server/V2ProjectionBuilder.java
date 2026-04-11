package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Converts a V2 ReportDefinition to V1 designer-projection format
 * consumable by {@link PdfRenderer}.
 *
 * <p>Mapping summary:
 * <ul>
 *   <li>V2 {@code pageSettings.paperSize/orientation} → V1 {@code pageSetup.paperSizeId/orientation}</li>
 *   <li>All V2 {@code pages[].sections[]} flat-merged → V1 {@code sections[]}</li>
 *   <li>V2 {@code calculationRules[].key} → V1 {@code calculationRules[].targetField}</li>
 *   <li>V2 {@code outputVariants[]} → V1 {@code variants[]} with field renaming:
 *       {@code id}→{@code variantId}, {@code hiddenElementIds}→{@code visibilityOverrides},
 *       {@code type}→{@code maskingType}, partial keepFirst/keepLast wrapped in {@code partialSpec}</li>
 *   <li>Provided {@code testData} → {@code _formData}</li>
 *   <li>Optional {@code variantId} → {@code _variantId}</li>
 * </ul>
 */
public final class V2ProjectionBuilder {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private V2ProjectionBuilder() {}

    /**
     * Build a V1 projection JSON string from a V2 ReportDefinition.
     *
     * @param templateId the template ID (placed in the single V1 template entry)
     * @param definition the parsed V2 ReportDefinition JSON node
     * @param testData   optional form data for {@code _formData}; may be null or missing
     * @param variantId  optional output variant ID for {@code _variantId}; may be null
     * @return V1 projection JSON string ready for {@link PdfRenderer#render}
     */
    public static String build(String templateId, JsonNode definition,
                               JsonNode testData, String variantId) throws Exception {
        ObjectNode projection = MAPPER.createObjectNode();

        // Single V1 template entry
        ArrayNode templates = projection.putArray("templates");
        ObjectNode tpl = templates.addObject();
        tpl.put("id", templateId);

        // pageSetup: V2 pageSettings.paperSize/orientation → V1 preset kind
        ObjectNode pageSetup = tpl.putObject("pageSetup");
        pageSetup.put("kind", "preset");
        JsonNode ps = definition.path("pageSettings");
        pageSetup.put("paperSizeId", ps.path("paperSize").asText("A4"));
        pageSetup.put("orientation", ps.path("orientation").asText("portrait"));

        // Pass margins from V2 pageSettings.margins → pageSetup.margins
        // PdfRenderer reads these for future clipping support (currently data-only).
        JsonNode marginsNode = ps.path("margins");
        ObjectNode margins = pageSetup.putObject("margins");
        margins.put("top",    marginsNode.path("top").asDouble(20));
        margins.put("right",  marginsNode.path("right").asDouble(20));
        margins.put("bottom", marginsNode.path("bottom").asDouble(20));
        margins.put("left",   marginsNode.path("left").asDouble(20));

        // sections: flat-merge from all pages
        ArrayNode sections = tpl.putArray("sections");
        JsonNode pages = definition.path("pages");
        if (pages.isArray()) {
            for (JsonNode page : pages) {
                JsonNode pageSections = page.path("sections");
                if (pageSections.isArray()) {
                    for (JsonNode s : pageSections) {
                        sections.add(s.deepCopy());
                    }
                }
            }
        }

        // calculationRules: V2 key → V1 targetField
        ArrayNode calcRules = tpl.putArray("calculationRules");
        JsonNode v2Rules = definition.path("calculationRules");
        if (v2Rules.isArray()) {
            for (JsonNode r : v2Rules) {
                String key = r.path("key").asText(null);
                String expression = r.path("expression").asText(null);
                if (key == null || expression == null) continue;
                ObjectNode v1Rule = calcRules.addObject();
                v1Rule.put("id", key);
                v1Rule.put("targetField", key);
                v1Rule.put("expression", expression);
                v1Rule.put("roundingPolicy", "none");
            }
        }

        // variants: V2 outputVariants → V1 variants
        ArrayNode variants = tpl.putArray("variants");
        JsonNode v2Variants = definition.path("outputVariants");
        if (v2Variants.isArray()) {
            for (JsonNode ov : v2Variants) {
                ObjectNode v1Variant = variants.addObject();
                v1Variant.put("variantId", ov.path("id").asText(""));
                v1Variant.put("name", ov.path("name").asText(""));

                // V2 hiddenElementIds[] → V1 visibilityOverrides: { elementId: false }
                ObjectNode vis = v1Variant.putObject("visibilityOverrides");
                JsonNode hiddenIds = ov.path("hiddenElementIds");
                if (hiddenIds.isArray()) {
                    for (JsonNode idNode : hiddenIds) {
                        vis.put(idNode.asText(), false);
                    }
                }

                // V2 maskingRules[].type → V1 maskingType; partial keepFirst/keepLast → partialSpec
                ArrayNode masks = v1Variant.putArray("maskingRules");
                JsonNode v2Masks = ov.path("maskingRules");
                if (v2Masks.isArray()) {
                    for (JsonNode m : v2Masks) {
                        ObjectNode v1Mask = masks.addObject();
                        v1Mask.put("targetElementId", m.path("targetElementId").asText(""));
                        String maskType = m.path("type").asText("hidden");
                        v1Mask.put("maskingType", maskType);
                        if ("fullReplace".equals(maskType)) {
                            v1Mask.put("replaceValue", m.path("replaceValue").asText(""));
                        } else if ("partial".equals(maskType)) {
                            ObjectNode partialSpec = v1Mask.putObject("partialSpec");
                            partialSpec.put("keepFirst", m.path("keepFirst").asInt(0));
                            partialSpec.put("keepLast", m.path("keepLast").asInt(0));
                        }
                    }
                }
            }
        }

        // _formData from testData
        if (testData != null && !testData.isMissingNode() && !testData.isNull()) {
            projection.set("_formData", testData);
        }

        // _variantId
        if (variantId != null && !variantId.isBlank()) {
            projection.put("_variantId", variantId);
        }

        return MAPPER.writeValueAsString(projection);
    }
}
