package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/** Tests for server-side structural validation (issue #52). */
class ReportDefinitionValidatorTest {

    private static final ObjectMapper M = new ObjectMapper();

    @Test
    void validMinimalDefinition_passes() throws Exception {
        JsonNode def =
                M.readTree(
                        """
            {"id":"d1","metadata":{"documentName":"OK"},
             "pages":[{"id":"p1","sections":[{"id":"s1","elements":[]}]}]}""");
        assertTrue(ReportDefinitionValidator.validate(def).isEmpty());
    }

    @Test
    void nonObject_isRejected() throws Exception {
        assertTrue(ReportDefinitionValidator.validate(M.readTree("[]")).isPresent());
        assertTrue(ReportDefinitionValidator.validate(M.readTree("\"x\"")).isPresent());
        assertTrue(ReportDefinitionValidator.validate(null).isPresent());
    }

    @Test
    void tooManyPages_isRejected() {
        ObjectNode def = M.createObjectNode();
        ArrayNode pages = def.putArray("pages");
        for (int i = 0; i <= ReportDefinitionValidator.MAX_PAGES; i++) {
            pages.addObject().put("id", "p" + i);
        }
        assertTrue(ReportDefinitionValidator.validate(def).orElse("").contains("Too many pages"));
    }

    @Test
    void tooManySectionsPerPage_isRejected() {
        ObjectNode def = M.createObjectNode();
        ObjectNode page = def.putArray("pages").addObject();
        ArrayNode sections = page.putArray("sections");
        for (int i = 0; i <= ReportDefinitionValidator.MAX_SECTIONS_PER_PAGE; i++) {
            sections.addObject().put("id", "s" + i);
        }
        assertTrue(
                ReportDefinitionValidator.validate(def).orElse("").contains("too many sections"));
    }

    @Test
    void tooManyElementsPerSection_isRejected() {
        ObjectNode def = M.createObjectNode();
        ObjectNode section = def.putArray("pages").addObject().putArray("sections").addObject();
        ArrayNode els = section.putArray("elements");
        for (int i = 0; i <= ReportDefinitionValidator.MAX_ELEMENTS_PER_SECTION; i++) {
            els.addObject().put("id", "e" + i);
        }
        assertTrue(
                ReportDefinitionValidator.validate(def).orElse("").contains("too many elements"));
    }

    @Test
    void pagesWrongType_isRejected() throws Exception {
        assertTrue(
                ReportDefinitionValidator.validate(M.readTree("{\"pages\":\"nope\"}")).isPresent());
    }

    @Test
    void tooManyCalculationRules_isRejected() {
        ObjectNode def = M.createObjectNode();
        ArrayNode rules = def.putArray("calculationRules");
        for (int i = 0; i <= ReportDefinitionValidator.MAX_CALCULATION_RULES; i++) {
            rules.addObject().put("key", "r" + i);
        }
        assertTrue(ReportDefinitionValidator.validate(def).orElse("").contains("calculationRules"));
    }

    @Test
    void tooManyOutputVariants_isRejected() {
        ObjectNode def = M.createObjectNode();
        ArrayNode variants = def.putArray("outputVariants");
        for (int i = 0; i <= ReportDefinitionValidator.MAX_OUTPUT_VARIANTS; i++) {
            variants.addObject().put("id", "v" + i);
        }
        assertTrue(ReportDefinitionValidator.validate(def).orElse("").contains("outputVariants"));
    }

    @Test
    void limitsMatchSharedLimitsFile() throws Exception {
        // The bundled resource is the single source (schemas/report-definition-limits.json)
        try (var in =
                ReportDefinitionValidator.class.getResourceAsStream(
                        "/report-definition-limits.json")) {
            assertNotNull(in, "report-definition-limits.json must be bundled into resources");
            JsonNode limits = M.readTree(in);
            assertEquals(limits.get("maxPages").asInt(), ReportDefinitionValidator.MAX_PAGES);
            assertEquals(
                    limits.get("maxSectionsPerPage").asInt(),
                    ReportDefinitionValidator.MAX_SECTIONS_PER_PAGE);
            assertEquals(
                    limits.get("maxElementsPerSection").asInt(),
                    ReportDefinitionValidator.MAX_ELEMENTS_PER_SECTION);
            assertEquals(
                    limits.get("maxCalculationRules").asInt(),
                    ReportDefinitionValidator.MAX_CALCULATION_RULES);
            assertEquals(
                    limits.get("maxValidationRules").asInt(),
                    ReportDefinitionValidator.MAX_VALIDATION_RULES);
        }
    }

    @Test
    void definitionWithoutPages_passes() throws Exception {
        // pages is optional at this layer (schema may be empty during authoring)
        assertTrue(
                ReportDefinitionValidator.validate(M.readTree("{\"id\":\"d1\",\"metadata\":{}}"))
                        .isEmpty());
    }
}
