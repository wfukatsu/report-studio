package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Prepares a V2 {@code ReportDefinition} for {@link PdfRenderer#renderDefinition}
 * (issue #52) — the single place the 5 V2 PDF controllers share instead of each
 * building a V1 projection via the retired {@code V2ProjectionBuilder}.
 *
 * <p>Enriches the definition's data with {@link CalculationEngine} results
 * (best-effort) and attaches the render-time control keys ({@code _formData},
 * {@code _variantId}) that {@code renderDefinition} reads from the root.
 */
public final class V2RenderSupport {

    private static final Logger log = LoggerFactory.getLogger(V2RenderSupport.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private V2RenderSupport() {}

    /**
     * @param definition the parsed V2 ReportDefinition
     * @param testData   optional form data (may be null/missing)
     * @param variantId  optional output-variant id (may be null)
     * @return a ReportDefinition JSON string ready for {@code renderDefinition}
     */
    public static String prepare(JsonNode definition, JsonNode testData, String variantId)
            throws Exception {
        ObjectNode root = (ObjectNode) definition.deepCopy();

        // Enrich data with calculation results, keyed off the definition's own
        // calculationRules (CalculationEngine reads the root rules + key/targetField)
        JsonNode data = (testData != null && !testData.isMissingNode() && !testData.isNull())
                ? testData : null;
        try {
            Map<String, Object> enriched = CalculationEngine.apply(root, data);
            root.set("_formData", MAPPER.valueToTree(enriched));
        } catch (CircularDependencyException e) {
            log.warn("Circular dependency in V2 calculation: {}", e.getMessage());
            if (data != null) root.set("_formData", data);
        } catch (Exception e) {
            log.warn("CalculationEngine enrichment failed: {}", e.getMessage());
            if (data != null) root.set("_formData", data);
        }

        if (variantId != null && !variantId.isBlank()) {
            root.put("_variantId", variantId);
        }
        return MAPPER.writeValueAsString(root);
    }
}
