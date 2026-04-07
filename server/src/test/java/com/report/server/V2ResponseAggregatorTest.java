package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class V2ResponseAggregatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static V2ResponseAggregator.ResponseEntry entry(String dataJson) throws Exception {
        JsonNode data = MAPPER.readTree(dataJson);
        return new V2ResponseAggregator.ResponseEntry("id1", "tmpl1", 1000L, "user1", data);
    }

    @Test
    void build_returnsEmptyForNoEntries() {
        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(List.of());
        assertTrue(result.isEmpty());
    }

    @Test
    void build_countsFieldOccurrences() throws Exception {
        List<V2ResponseAggregator.ResponseEntry> entries = List.of(
            entry("{\"name\": \"Alice\"}"),
            entry("{\"name\": \"Bob\"}"),
            entry("{\"name\": \"Alice\"}")
        );

        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(entries);

        assertTrue(result.containsKey("name"));
        assertEquals(3, result.get("name").count());
    }

    @Test
    void build_topValuesRankedByFrequency() throws Exception {
        List<V2ResponseAggregator.ResponseEntry> entries = List.of(
            entry("{\"status\": \"open\"}"),
            entry("{\"status\": \"open\"}"),
            entry("{\"status\": \"closed\"}"),
            entry("{\"status\": \"open\"}")
        );

        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(entries);
        List<Object> topValues = result.get("status").topValues();

        assertEquals("open", topValues.get(0));
        assertEquals("closed", topValues.get(1));
    }

    @Test
    void build_skipsNullValues() throws Exception {
        List<V2ResponseAggregator.ResponseEntry> entries = List.of(
            entry("{\"field\": null}"),
            entry("{\"field\": \"value\"}")
        );

        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(entries);
        // null is skipped, only "value" counted
        assertEquals(1, result.get("field").count());
    }

    @Test
    void build_skipsEntriesWithNullData() {
        V2ResponseAggregator.ResponseEntry entry = new V2ResponseAggregator.ResponseEntry(
            "id1", "tmpl1", 1000L, "user1", null
        );

        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(List.of(entry));
        assertTrue(result.isEmpty());
    }

    @Test
    void build_limitsTopValuesToFive() throws Exception {
        // Create 7 unique values
        List<V2ResponseAggregator.ResponseEntry> entries = List.of(
            entry("{\"x\": \"a\"}"),
            entry("{\"x\": \"b\"}"),
            entry("{\"x\": \"c\"}"),
            entry("{\"x\": \"d\"}"),
            entry("{\"x\": \"e\"}"),
            entry("{\"x\": \"f\"}"),
            entry("{\"x\": \"g\"}")
        );

        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(entries);
        assertTrue(result.get("x").topValues().size() <= 5);
    }

    @Test
    void build_handlesMultipleFields() throws Exception {
        List<V2ResponseAggregator.ResponseEntry> entries = List.of(
            entry("{\"name\": \"Alice\", \"score\": 90}"),
            entry("{\"name\": \"Bob\", \"score\": 80}")
        );

        Map<String, V2ResponseAggregator.FieldSummary> result = V2ResponseAggregator.build(entries);
        assertTrue(result.containsKey("name"));
        assertTrue(result.containsKey("score"));
        assertEquals(2, result.get("name").count());
        assertEquals(2, result.get("score").count());
    }
}
