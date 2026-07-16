package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for CalculationEngine results reaching the PDF (issue #59).
 *
 * <p>Replicates the enrichment seam used by PdfController / V2PdfController /
 * V2StatelessPdfController: {@code CalculationEngine.apply} enriches
 * {@code _formData}, then the projection is rendered and the computed values
 * are asserted in the extracted text.
 */
class PdfCalculationParseBackTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Same three lines as the controllers' private enrichWithCalculations. */
    private static PdfProbe renderEnriched(String projectionJson) throws Exception {
        ObjectNode projNode = (ObjectNode) MAPPER.readTree(projectionJson);
        Map<String, Object> enriched = CalculationEngine.apply(projNode, projNode.path("_formData"));
        projNode.set("_formData", MAPPER.valueToTree(enriched));
        return PdfProbe.parse(PdfRenderer.render(MAPPER.writeValueAsString(projNode)));
    }

    private static String projection(String rules) {
        return """
            {"templates":[{
              "id":"t1","name":"Calc",
              "calculationRules":[%s],
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[
                  {"id":"e1","kind":"text","name":"Subtotal",
                   "frame":{"x":20,"y":20,"width":80,"height":8,"rotation":0},
                   "bindingRef":"subtotal","props":{"fontSize":12}},
                  {"id":"e2","kind":"text","name":"Tax",
                   "frame":{"x":20,"y":40,"width":80,"height":8,"rotation":0},
                   "bindingRef":"tax","props":{"fontSize":12}}
                ]
              }]
            }],
            "_formData":{"price":1500,"quantity":3}}""".formatted(rules);
    }

    @Test
    void calculatedField_rendersInPdf() throws Exception {
        PdfProbe probe = renderEnriched(projection("""
            {"id":"r1","targetField":"subtotal","expression":"price * quantity","roundingPolicy":"none"}"""));
        assertTrue(probe.pageContains(0, "4500"), probe.pageText(0));
    }

    @Test
    void chainedRules_evaluateInDependencyOrder() throws Exception {
        // tax depends on subtotal — topological sort must order them correctly
        PdfProbe probe = renderEnriched(projection("""
            {"id":"r2","targetField":"tax","expression":"subtotal * 0.1","roundingPolicy":"floor"},
            {"id":"r1","targetField":"subtotal","expression":"price * quantity","roundingPolicy":"none"}"""));
        assertTrue(probe.pageContains(0, "4500"), probe.pageText(0));
        // KNOWN PRECISION GAP (#57): double math renders as "450.0", not "450"
        // or a formatted currency string. Update when BigDecimal formatting lands.
        assertTrue(probe.pageContains(0, "450.0"), probe.pageText(0));
    }

    @Test
    void floorRounding_truncatesFraction() throws Exception {
        PdfProbe probe = renderEnriched("""
            {"templates":[{
              "id":"t1","name":"Floor",
              "calculationRules":[
                {"id":"r1","targetField":"tax","expression":"price * 0.08","roundingPolicy":"floor"}],
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"Tax",
                  "frame":{"x":20,"y":20,"width":80,"height":8,"rotation":0},
                  "bindingRef":"tax","props":{"fontSize":12}}]
              }]
            }],
            "_formData":{"price":1234}}""");
        // 1234 * 0.08 = 98.72 → floor → 98.0 (double formatting — #57)
        assertTrue(probe.pageContains(0, "98.0"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "98.72"));
    }
}
