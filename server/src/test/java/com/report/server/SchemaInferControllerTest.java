package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SchemaInferControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SchemaInferController controller;
    private Context ctx;
    private Object capturedJson;
    private int capturedStatus = 200;

    @BeforeEach
    void setUp() {
        controller = new SchemaInferController();
        ctx = mock(Context.class);
        when(ctx.status(anyInt()))
                .thenAnswer(
                        inv -> {
                            capturedStatus = (int) inv.getArguments()[0];
                            return ctx;
                        });
        doAnswer(
                        inv -> {
                            capturedJson = inv.getArguments()[0];
                            return null;
                        })
                .when(ctx)
                .json(any());
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    @Test
    void infersMasterGroupFromFlatObject() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {"name": "Alice", "age": 30, "active": true}}
        """);

        controller.infer(ctx);

        assertEquals(200, capturedStatus);
        JsonNode result = MAPPER.valueToTree(capturedJson);
        JsonNode groups = result.get("groups");
        assertNotNull(groups, "groups should be present");
        assertEquals(1, groups.size());

        JsonNode master = groups.get(0);
        assertEquals("master", master.get("role").asText());
        assertEquals("マスター", master.get("label").asText());

        JsonNode fields = master.get("fields");
        assertEquals(3, fields.size());

        // Check field types
        Map<String, String> typeMap = new HashMap<>();
        for (JsonNode f : fields) {
            typeMap.put(f.get("key").asText(), f.get("type").asText());
        }
        assertEquals("string", typeMap.get("name"));
        assertEquals("number", typeMap.get("age"));
        assertEquals("boolean", typeMap.get("active"));
    }

    @Test
    void infersDetailGroupFromArrayOfObjects() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {
                "title": "Invoice",
                "items": [
                    {"description": "Widget", "qty": 2, "price": 9.99}
                ]
            }}
        """);

        controller.infer(ctx);

        assertEquals(200, capturedStatus);
        JsonNode groups = MAPPER.valueToTree(capturedJson).get("groups");
        assertEquals(2, groups.size());

        // First group: master
        JsonNode master = groups.get(0);
        assertEquals("master", master.get("role").asText());
        assertEquals(1, master.get("fields").size()); // only "title"

        // Second group: detail for "items"
        JsonNode detail = groups.get(1);
        assertEquals("detail", detail.get("role").asText());
        assertEquals("items", detail.get("label").asText());
        assertEquals("items", detail.get("dataKey").asText());
        assertEquals(3, detail.get("fields").size());
    }

    @Test
    void handlesEmptyObject() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {}}
        """);

        controller.infer(ctx);

        assertEquals(200, capturedStatus);
        JsonNode groups = MAPPER.valueToTree(capturedJson).get("groups");
        assertEquals(0, groups.size());
    }

    @Test
    void handlesOnlyDetailGroups() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {"rows": [{"x": 1}, {"x": 2}]}}
        """);

        controller.infer(ctx);

        assertEquals(200, capturedStatus);
        JsonNode groups = MAPPER.valueToTree(capturedJson).get("groups");
        assertEquals(1, groups.size());
        assertEquals("detail", groups.get(0).get("role").asText());
        assertEquals("rows", groups.get(0).get("dataKey").asText());
    }

    @Test
    void infersArrayTypeForNestedArray() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {"tags": ["a", "b", "c"]}}
        """);

        controller.infer(ctx);

        assertEquals(200, capturedStatus);
        JsonNode groups = MAPPER.valueToTree(capturedJson).get("groups");
        // tags is a flat array (not array of objects) → master field with type "array"
        JsonNode master = groups.get(0);
        assertEquals("master", master.get("role").asText());
        JsonNode tagField = master.get("fields").get(0);
        assertEquals("tags", tagField.get("key").asText());
        assertEquals("array", tagField.get("type").asText());
    }

    @Test
    void mergesFieldsFromMultipleDetailRows() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {
                "rows": [
                    {"a": 1},
                    {"b": "hello"},
                    {"a": 2, "c": true}
                ]
            }}
        """);

        controller.infer(ctx);

        assertEquals(200, capturedStatus);
        JsonNode detail = MAPPER.valueToTree(capturedJson).get("groups").get(0);
        // Should have a, b, c — merged from all rows
        assertEquals(3, detail.get("fields").size());
    }

    @Test
    void eachFieldHasIdLabelKeyType() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": {"foo": "bar"}}
        """);

        controller.infer(ctx);

        JsonNode field = MAPPER.valueToTree(capturedJson).get("groups").get(0).get("fields").get(0);
        assertNotNull(field.get("id"), "id should be present");
        assertTrue(field.get("id").asText().startsWith("fld-"));
        assertEquals("foo", field.get("key").asText());
        assertEquals("foo", field.get("label").asText());
        assertEquals("string", field.get("type").asText());
    }

    // ── Validation errors ────────────────────────────────────────────────────

    @Test
    void returns400WhenNoSampleField() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"data": {"name": "Alice"}}
        """);

        controller.infer(ctx);

        assertEquals(400, capturedStatus);
    }

    @Test
    void returns400WhenSampleIsNotObject() throws Exception {
        when(ctx.body())
                .thenReturn(
                        """
            {"sample": ["not", "an", "object"]}
        """);

        controller.infer(ctx);

        assertEquals(400, capturedStatus);
    }

    @Test
    void returns400WhenBodyIsNotJson() throws Exception {
        when(ctx.body()).thenReturn("not json at all");
        when(ctx.contentType()).thenReturn("application/json");
        // ctx.status(HttpStatus) overload also returns ctx — stub it
        when(ctx.status(any(io.javalin.http.HttpStatus.class))).thenAnswer(inv -> ctx);

        controller.infer(ctx);

        // RequestValidator calls ctx.status(HttpStatus.BAD_REQUEST)
        verify(ctx, atLeastOnce()).status(io.javalin.http.HttpStatus.BAD_REQUEST);
    }

    @Test
    void returns413WhenBodyTooLarge() throws Exception {
        String huge = "{\"sample\": {\"x\": \"" + "a".repeat(1_100_000) + "\"}}";
        when(ctx.body()).thenReturn(huge);

        controller.infer(ctx);

        assertEquals(413, capturedStatus);
    }
}
