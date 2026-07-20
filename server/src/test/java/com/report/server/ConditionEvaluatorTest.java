package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * ConditionEvaluator — conditional element visibility (#222).
 *
 * <p>Mirrors the operator table exercised by the frontend conditionEvaluator.test.ts so a
 * divergence between the two implementations is caught on the server side.
 */
class ConditionEvaluatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** Build an element whose single condition is (fieldPath op value). */
    private JsonNode element(String fieldPath, String op, String value) {
        return parse(
                "{\"conditionalDisplay\":{\"logic\":\"and\",\"conditions\":[{\"fieldPath\":\""
                        + fieldPath
                        + "\",\"operator\":\""
                        + op
                        + "\",\"value\":\""
                        + value
                        + "\"}]}}");
    }

    private boolean render(JsonNode el, JsonNode data) {
        return ConditionEvaluator.shouldRender(el, data, 0);
    }

    // ── No / empty rules always render ──────────────────────────────────────

    @Test
    void noConditionalDisplay_rendersAlways() {
        assertTrue(render(parse("{}"), parse("{}")));
    }

    @Test
    void nullConditionalDisplay_rendersAlways() {
        assertTrue(render(parse("{\"conditionalDisplay\":null}"), parse("{}")));
    }

    @Test
    void emptyConditionsArray_rendersAlways() {
        JsonNode el = parse("{\"conditionalDisplay\":{\"conditions\":[]}}");
        assertTrue(render(el, parse("{}")));
    }

    // ── Equality / containment operators ────────────────────────────────────

    @Test
    void equals_matchesExactValue() {
        JsonNode el = element("status", "equals", "paid");
        assertTrue(render(el, parse("{\"status\":\"paid\"}")));
        assertFalse(render(el, parse("{\"status\":\"unpaid\"}")));
    }

    @Test
    void notEquals_isInverseOfEquals() {
        JsonNode el = element("status", "not_equals", "paid");
        assertFalse(render(el, parse("{\"status\":\"paid\"}")));
        assertTrue(render(el, parse("{\"status\":\"unpaid\"}")));
    }

    @Test
    void contains_matchesSubstring() {
        JsonNode el = element("note", "contains", "urgent");
        assertTrue(render(el, parse("{\"note\":\"very urgent!\"}")));
        assertFalse(render(el, parse("{\"note\":\"calm\"}")));
    }

    @Test
    void notContains_matchesWhenAbsentOrNull() {
        JsonNode el = element("note", "not_contains", "urgent");
        assertTrue(render(el, parse("{\"note\":\"calm\"}")));
        assertTrue(render(el, parse("{}"))); // null field → not_contains is true
        assertFalse(render(el, parse("{\"note\":\"urgent\"}")));
    }

    // ── Emptiness operators ─────────────────────────────────────────────────

    @Test
    void empty_trueForMissingOrBlank() {
        JsonNode el = element("memo", "empty", "");
        assertTrue(render(el, parse("{}")));
        assertTrue(render(el, parse("{\"memo\":\"\"}")));
        assertFalse(render(el, parse("{\"memo\":\"x\"}")));
    }

    @Test
    void notEmpty_trueOnlyWhenPresent() {
        JsonNode el = element("memo", "not_empty", "");
        assertFalse(render(el, parse("{}")));
        assertTrue(render(el, parse("{\"memo\":\"x\"}")));
    }

    // ── Numeric comparison operators ────────────────────────────────────────

    @Test
    void numericComparisons() {
        assertTrue(render(element("total", "greater_than", "100"), parse("{\"total\":\"150\"}")));
        assertFalse(render(element("total", "greater_than", "100"), parse("{\"total\":\"50\"}")));
        assertTrue(render(element("total", "less_than", "100"), parse("{\"total\":\"50\"}")));
        assertTrue(
                render(
                        element("total", "greater_than_or_equal", "100"),
                        parse("{\"total\":\"100\"}")));
        assertTrue(
                render(
                        element("total", "less_than_or_equal", "100"),
                        parse("{\"total\":\"100\"}")));
    }

    @Test
    void nonNumericValue_comparesAsZero() {
        // compareNumeric swallows NumberFormatException and returns 0 → not > 100.
        assertFalse(render(element("total", "greater_than", "100"), parse("{\"total\":\"abc\"}")));
    }

    // ── and / or logic ──────────────────────────────────────────────────────

    @Test
    void andLogic_requiresAllConditions() {
        JsonNode el =
                parse(
                        "{\"conditionalDisplay\":{\"logic\":\"and\",\"conditions\":["
                                + "{\"fieldPath\":\"a\",\"operator\":\"equals\",\"value\":\"1\"},"
                                + "{\"fieldPath\":\"b\",\"operator\":\"equals\",\"value\":\"2\"}]}}");
        assertTrue(render(el, parse("{\"a\":\"1\",\"b\":\"2\"}")));
        assertFalse(render(el, parse("{\"a\":\"1\",\"b\":\"9\"}")));
    }

    @Test
    void orLogic_requiresAnyCondition() {
        JsonNode el =
                parse(
                        "{\"conditionalDisplay\":{\"logic\":\"or\",\"conditions\":["
                                + "{\"fieldPath\":\"a\",\"operator\":\"equals\",\"value\":\"1\"},"
                                + "{\"fieldPath\":\"b\",\"operator\":\"equals\",\"value\":\"2\"}]}}");
        assertTrue(render(el, parse("{\"a\":\"9\",\"b\":\"2\"}")));
        assertFalse(render(el, parse("{\"a\":\"9\",\"b\":\"9\"}")));
    }

    @Test
    void logicDefaultsToAnd_whenUnspecified() {
        JsonNode el =
                parse(
                        "{\"conditionalDisplay\":{\"conditions\":["
                                + "{\"fieldPath\":\"a\",\"operator\":\"equals\",\"value\":\"1\"},"
                                + "{\"fieldPath\":\"b\",\"operator\":\"equals\",\"value\":\"2\"}]}}");
        assertFalse(render(el, parse("{\"a\":\"1\",\"b\":\"9\"}")));
    }

    // ── Detail-row (group[].field) path resolution ──────────────────────────

    @Test
    void detailFieldPath_resolvesAgainstTheGivenRow() {
        JsonNode el = element("items[].sku", "equals", "B");
        JsonNode data = parse("{\"items\":[{\"sku\":\"A\"},{\"sku\":\"B\"}]}");
        assertFalse(ConditionEvaluator.shouldRender(el, data, 0));
        assertTrue(ConditionEvaluator.shouldRender(el, data, 1));
    }

    @Test
    void detailFieldPath_outOfRangeRow_treatedAsNull() {
        JsonNode el = element("items[].sku", "not_empty", "");
        JsonNode data = parse("{\"items\":[{\"sku\":\"A\"}]}");
        assertFalse(
                ConditionEvaluator.shouldRender(
                        el, data, 5)); // row 5 absent → null → not_empty false
    }

    // ── Null form data ──────────────────────────────────────────────────────

    @Test
    void nullFormData_fieldResolvesToNull() {
        JsonNode el = element("status", "empty", "");
        assertTrue(ConditionEvaluator.shouldRender(el, MAPPER.nullNode(), 0));
    }
}
