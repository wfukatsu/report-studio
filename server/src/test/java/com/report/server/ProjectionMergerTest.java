package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ProjectionMergerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── Master field binding ──

    @Test
    void mergesMasterFieldIntoTextElement() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "props": { "text": "placeholder" },
                    "bindingRef": "company.name"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("company.name", "株式会社テスト");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode result = MAPPER.readTree(merged);
        JsonNode el = result.get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("株式会社テスト", el.get("props").get("text").asText());
        // bindingRef should be preserved
        assertEquals("company.name", el.get("bindingRef").asText());
    }

    @Test
    void mergesMultipleFields() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [
                    { "id": "e1", "kind": "text", "props": { "text": "" }, "bindingRef": "name" },
                    { "id": "e2", "kind": "text", "props": { "text": "" }, "bindingRef": "address" }
                  ]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("name", "田中太郎", "address", "東京都千代田区");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode result = MAPPER.readTree(merged);
        JsonNode elements = result.get("templates").get(0).get("sections").get(0).get("elements");
        assertEquals("田中太郎", elements.get(0).get("props").get("text").asText());
        assertEquals("東京都千代田区", elements.get(1).get("props").get("text").asText());
    }

    // ── Element kind → prop key mapping ──

    @Test
    void mergesIntoValuePropForBarcode() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "barcode",
                    "props": { "value": "" },
                    "bindingRef": "employee.code"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("employee.code", "EMP-001");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("EMP-001", el.get("props").get("value").asText());
    }

    @Test
    void mergesIntoCheckedPropForCheckbox() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "checkbox",
                    "props": { "checked": false },
                    "bindingRef": "is_active"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("is_active", "true");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("true", el.get("props").get("checked").asText());
    }

    @Test
    void mergesIntoValuePropForQrcode() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "qrcode",
                    "props": { "value": "" },
                    "bindingRef": "url"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("url", "https://example.com");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("https://example.com", el.get("props").get("value").asText());
    }

    // ── Edge cases ──

    @Test
    void skipsElementsWithoutBindingRef() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "props": { "text": "static label" }
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("anything", "value");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("static label", el.get("props").get("text").asText());
    }

    @Test
    void skipsSystemVariables() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "props": { "text": "" },
                    "bindingRef": "{currentDate}"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("{currentDate}", "should-not-appear");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("", el.get("props").get("text").asText());
    }

    @Test
    void leavesUnmatchedBindingRefUnchanged() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "props": { "text": "original" },
                    "bindingRef": "missing.field"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("other.field", "value");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("original", el.get("props").get("text").asText());
    }

    @Test
    void handlesMultipleSections() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [
                  {
                    "id": "s1",
                    "elements": [{ "id": "e1", "kind": "text", "props": { "text": "" }, "bindingRef": "name" }]
                  },
                  {
                    "id": "s2",
                    "elements": [{ "id": "e2", "kind": "text", "props": { "text": "" }, "bindingRef": "amount" }]
                  }
                ]
              }]
            }
            """;

        Map<String, String> row = Map.of("name", "テスト", "amount", "10000");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode sections = MAPPER.readTree(merged).get("templates").get(0).get("sections");
        assertEquals("テスト", sections.get(0).get("elements").get(0).get("props").get("text").asText());
        assertEquals("10000", sections.get(1).get("elements").get(0).get("props").get("text").asText());
    }

    @Test
    void handlesMultipleTemplates() throws Exception {
        String projection = """
            {
              "templates": [
                {
                  "id": "t1",
                  "sections": [{
                    "id": "s1",
                    "elements": [{ "id": "e1", "kind": "text", "props": { "text": "" }, "bindingRef": "name" }]
                  }]
                },
                {
                  "id": "t2",
                  "sections": [{
                    "id": "s2",
                    "elements": [{ "id": "e2", "kind": "text", "props": { "text": "" }, "bindingRef": "name" }]
                  }]
                }
              ]
            }
            """;

        Map<String, String> row = Map.of("name", "両方に適用");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode templates = MAPPER.readTree(merged).get("templates");
        assertEquals("両方に適用",
            templates.get(0).get("sections").get(0).get("elements").get(0).get("props").get("text").asText());
        assertEquals("両方に適用",
            templates.get(1).get("sections").get(0).get("elements").get(0).get("props").get("text").asText());
    }

    @Test
    void preservesNonElementFields() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "name": "テスト帳票",
                "pageSetup": { "kind": "preset", "paperSizeId": "A4" },
                "sections": [{
                  "id": "s1",
                  "type": "page_base",
                  "y": 0,
                  "height": 100,
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "frame": { "x": 10, "y": 20, "width": 100, "height": 20 },
                    "props": { "text": "", "fontSize": 14 },
                    "bindingRef": "name"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("name", "resolved");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode tmpl = MAPPER.readTree(merged).get("templates").get(0);
        assertEquals("テスト帳票", tmpl.get("name").asText());
        assertEquals("A4", tmpl.get("pageSetup").get("paperSizeId").asText());

        JsonNode section = tmpl.get("sections").get(0);
        assertEquals("page_base", section.get("type").asText());
        assertEquals(100, section.get("height").asInt());

        JsonNode el = section.get("elements").get(0);
        assertEquals(14, el.get("props").get("fontSize").asInt());
        assertEquals(10, el.get("frame").get("x").asInt());
    }

    @Test
    void handlesEmptyProjection() throws Exception {
        String projection = """
            { "templates": [] }
            """;

        Map<String, String> row = Map.of("name", "value");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode result = MAPPER.readTree(merged);
        assertTrue(result.get("templates").isEmpty());
    }

    @Test
    void handlesEmptyDataRow() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "props": { "text": "original" },
                    "bindingRef": "name"
                  }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of();
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("original", el.get("props").get("text").asText());
    }

    // ── Detail field binding (group[].field → flat row data) ──

    @Test
    void mergesDetailFieldFromFlatRow() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{
                    "id": "e1",
                    "kind": "text",
                    "props": { "text": "" },
                    "bindingRef": "income[].payment_amount"
                  }]
                }]
              }]
            }
            """;

        // In batch context, detail fields are flattened: "income[].payment_amount" → "income[].payment_amount"
        Map<String, String> row = Map.of("income[].payment_amount", "500000");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode el = MAPPER.readTree(merged)
            .get("templates").get(0).get("sections").get(0).get("elements").get(0);
        assertEquals("500000", el.get("props").get("text").asText());
    }

    @Test
    void doesNotProduceFormDataField() throws Exception {
        String projection = """
            {
              "templates": [{
                "id": "t1",
                "sections": [{
                  "id": "s1",
                  "elements": [{ "id": "e1", "kind": "text", "props": { "text": "" }, "bindingRef": "name" }]
                }]
              }]
            }
            """;

        Map<String, String> row = Map.of("name", "test");
        String merged = ProjectionMerger.merge(projection, row);

        JsonNode result = MAPPER.readTree(merged);
        assertNull(result.get("_formData"), "Merged projection should not contain _formData");
    }
}
