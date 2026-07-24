package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Structured summary entries (#412): {@code buildSummaryItems} carries {@code {key, text}} / {@code
 * {key, count}} objects, and the legacy {@code buildSummary} lines (ja wording, "N件" for arrays)
 * are derived from them unchanged.
 */
class ResponsePayloadSupportTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode json(String text) throws Exception {
        return MAPPER.readTree(text);
    }

    @Test
    void buildSummaryItems_emitsTextForScalarsAndCountForArrays() throws Exception {
        JsonNode data = json("{\"customer\":{\"name\":\"評価商事\"},\"items\":[1,2,3],\"total\":1200}");

        List<Map<String, Object>> items = ResponsePayloadSupport.buildSummaryItems(data);

        assertEquals(3, items.size());
        assertEquals(Map.of("key", "customer.name", "text", "評価商事"), items.get(0));
        assertEquals(Map.of("key", "items", "count", 3), items.get(1));
        assertEquals(Map.of("key", "total", "text", "1200"), items.get(2));
    }

    @Test
    void buildSummary_linesMatchLegacyWording() throws Exception {
        JsonNode data = json("{\"customer\":{\"name\":\"評価商事\"},\"items\":[1,2,3],\"total\":1200}");

        List<String> lines = ResponsePayloadSupport.buildSummary(data);

        assertEquals(List.of("customer.name: 評価商事", "items: 3件", "total: 1200"), lines);
    }

    @Test
    void buildSummary_truncatesLongTextAt50Chars() throws Exception {
        String longText = "a".repeat(60);
        JsonNode data = json("{\"note\":\"" + longText + "\"}");

        List<String> lines = ResponsePayloadSupport.buildSummary(data);

        assertEquals("note: " + "a".repeat(50) + "...", lines.get(0));
    }

    @Test
    void buildSummaryItems_returnsEmptyForNonObject() throws Exception {
        assertTrue(ResponsePayloadSupport.buildSummaryItems(null).isEmpty());
        assertTrue(ResponsePayloadSupport.buildSummaryItems(json("[1,2]")).isEmpty());
    }

    @Test
    void buildSummary_capsAtThreeFields() throws Exception {
        JsonNode data = json("{\"a\":1,\"b\":2,\"c\":3,\"d\":4}");

        assertEquals(3, ResponsePayloadSupport.buildSummary(data).size());
        assertEquals(3, ResponsePayloadSupport.buildSummaryItems(data).size());
    }
}
