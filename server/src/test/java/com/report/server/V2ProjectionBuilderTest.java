package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for V2ProjectionBuilder — V2 ReportDefinition → V1 projection format.
 */
class V2ProjectionBuilderTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── helpers ───────────────────────────────────────────────────────────────

    private static JsonNode buildDefinition(String extraJson) throws Exception {
        String json = """
            {
              "id": "tpl-1",
              "metadata": { "documentName": "Test" },
              "pageSettings": { "paperSize": "A4", "orientation": "portrait" },
              "pages": [
                { "id": "page-1", "sections": [
                  { "type": "page_base", "elements": [{ "id": "el-1", "kind": "text", "content": "Hello" }] }
                ]},
                { "id": "page-2", "sections": [
                  { "type": "page_base", "elements": [{ "id": "el-2", "kind": "text", "content": "World" }] }
                ]}
              ],
              "calculationRules": [
                { "key": "total", "expression": "price * qty" }
              ],
              "outputVariants": [
                {
                  "id": "v-internal",
                  "name": "社内用",
                  "hiddenElementIds": ["el-1"],
                  "maskingRules": [
                    { "id": "m-1", "targetElementId": "el-2", "type": "fullReplace", "replaceValue": "***" }
                  ]
                },
                {
                  "id": "v-partial",
                  "name": "部分マスク",
                  "hiddenElementIds": [],
                  "maskingRules": [
                    { "id": "m-2", "targetElementId": "el-1", "type": "partial", "keepFirst": 3, "keepLast": 2 }
                  ]
                }
              ],
              "templateVariables": [],
              "dataSources": [],
              "submissionModels": [],
              "validationRules": []
              """ + (extraJson.isBlank() ? "" : ", " + extraJson) + """
            }
            """;
        return MAPPER.readTree(json);
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    void buildsTemplatesArray() throws Exception {
        JsonNode def = buildDefinition("");
        String json = V2ProjectionBuilder.build("tpl-1", def, null, null);
        JsonNode root = MAPPER.readTree(json);

        assertTrue(root.has("templates"));
        assertEquals(1, root.get("templates").size());
        assertEquals("tpl-1", root.get("templates").get(0).get("id").asText());
    }

    @Test
    void mapsPageSetupFromPageSettings() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, null, null));

        JsonNode pageSetup = root.get("templates").get(0).get("pageSetup");
        assertEquals("preset", pageSetup.get("kind").asText());
        assertEquals("A4", pageSetup.get("paperSizeId").asText());
        assertEquals("portrait", pageSetup.get("orientation").asText());
    }

    @Test
    void flatMergesPageSections() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, null, null));

        JsonNode sections = root.get("templates").get(0).get("sections");
        assertEquals(2, sections.size(), "Both pages' sections merged flat");
        assertEquals("el-1", sections.get(0).get("elements").get(0).get("id").asText());
        assertEquals("el-2", sections.get(1).get("elements").get(0).get("id").asText());
    }

    @Test
    void mapsCalculationRules() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, null, null));

        JsonNode rules = root.get("templates").get(0).get("calculationRules");
        assertEquals(1, rules.size());
        JsonNode r = rules.get(0);
        assertEquals("total", r.get("id").asText());
        assertEquals("total", r.get("targetField").asText());
        assertEquals("price * qty", r.get("expression").asText());
        assertEquals("none", r.get("roundingPolicy").asText());
    }

    @Test
    void mapsOutputVariantsToV1Variants() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, null, null));

        JsonNode variants = root.get("templates").get(0).get("variants");
        assertEquals(2, variants.size());

        JsonNode v1 = variants.get(0);
        assertEquals("v-internal", v1.get("variantId").asText());
        assertEquals("社内用", v1.get("name").asText());

        // hiddenElementIds → visibilityOverrides
        JsonNode vis = v1.get("visibilityOverrides");
        assertFalse(vis.get("el-1").asBoolean());

        // maskingRules: fullReplace
        JsonNode mask = v1.get("maskingRules").get(0);
        assertEquals("el-2", mask.get("targetElementId").asText());
        assertEquals("fullReplace", mask.get("maskingType").asText());
        assertEquals("***", mask.get("replaceValue").asText());
    }

    @Test
    void mapsPartialMaskingRule() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, null, null));

        JsonNode v2 = root.get("templates").get(0).get("variants").get(1);
        JsonNode mask = v2.get("maskingRules").get(0);
        assertEquals("partial", mask.get("maskingType").asText());
        assertEquals(3, mask.get("partialSpec").get("keepFirst").asInt());
        assertEquals(2, mask.get("partialSpec").get("keepLast").asInt());
    }

    @Test
    void setsFormDataAndVariantId() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode testData = MAPPER.readTree("{\"name\": \"Alice\"}");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, testData, "v-internal"));

        assertEquals("Alice", root.get("_formData").get("name").asText());
        assertEquals("v-internal", root.get("_variantId").asText());
    }

    @Test
    void omitsFormDataAndVariantIdWhenNull() throws Exception {
        JsonNode def = buildDefinition("");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-1", def, null, null));

        assertFalse(root.has("_formData"), "_formData should be absent when null");
        assertFalse(root.has("_variantId"), "_variantId should be absent when null");
    }

    @Test
    void handlesEmptyPagesGracefully() throws Exception {
        String defJson = """
            {
              "id": "tpl-empty",
              "metadata": { "documentName": "Empty" },
              "pageSettings": { "paperSize": "A4", "orientation": "portrait" },
              "pages": [],
              "calculationRules": [],
              "outputVariants": []
            }
            """;
        JsonNode def = MAPPER.readTree(defJson);
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("tpl-empty", def, null, null));

        assertEquals(0, root.get("templates").get(0).get("sections").size());
        assertEquals(0, root.get("templates").get(0).get("calculationRules").size());
        assertEquals(0, root.get("templates").get(0).get("variants").size());
    }

    @Test
    void defaultsPageSetupWhenPageSettingsMissing() throws Exception {
        JsonNode def = MAPPER.readTree("{\"id\": \"x\"}");
        JsonNode root = MAPPER.readTree(V2ProjectionBuilder.build("x", def, null, null));

        JsonNode ps = root.get("templates").get(0).get("pageSetup");
        assertEquals("A4", ps.get("paperSizeId").asText());
        assertEquals("portrait", ps.get("orientation").asText());
    }
}
