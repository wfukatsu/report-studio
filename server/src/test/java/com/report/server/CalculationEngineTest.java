package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CalculationEngineTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonNode parse(String json) {
        try { return MAPPER.readTree(json); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    // ── Basic calculation ─────────────────────────────────────────────────────

    @Test
    void apply_noRules_returnsFormDataUnchanged() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"calculationRules\":[]}]}");
        JsonNode formData = parse("{\"amount\":100}");

        Map<String, Object> result = CalculationEngine.apply(projection, formData);
        assertEquals(100.0, ((Number) result.get("amount")).doubleValue(), 0.01);
    }

    @Test
    void apply_singleRule_computesTargetField() throws Exception {
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"total","expression":"price * qty","roundingPolicy":"round"}
            ]}]}""");
        JsonNode formData = parse("{\"price\":100.0,\"qty\":3.0}");

        Map<String, Object> result = CalculationEngine.apply(projection, formData);
        assertEquals(300.0, ((Number) result.get("total")).doubleValue(), 0.01);
    }

    @Test
    void apply_chainedRules_executedInOrder() throws Exception {
        // subtotal = price * qty; total = subtotal + tax
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"subtotal","expression":"price * qty"},
              {"id":"r2","targetField":"total","expression":"subtotal + tax"}
            ]}]}""");
        JsonNode formData = parse("{\"price\":100.0,\"qty\":3.0,\"tax\":50.0}");

        Map<String, Object> result = CalculationEngine.apply(projection, formData);
        assertEquals(300.0, ((Number) result.get("subtotal")).doubleValue(), 0.01);
        assertEquals(350.0, ((Number) result.get("total")).doubleValue(), 0.01);
    }

    @Test
    void apply_sumOverCollection_works() throws Exception {
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"totalAmount","expression":"sum(items, 'amount')"}
            ]}]}""");
        JsonNode formData = parse("""
            {"items":[
              {"name":"A","amount":100.0},
              {"name":"B","amount":200.0},
              {"name":"C","amount":300.0}
            ]}""");

        Map<String, Object> result = CalculationEngine.apply(projection, formData);
        assertEquals(600.0, ((Number) result.get("totalAmount")).doubleValue(), 0.01);
    }

    @Test
    void apply_roundingPolicy_floor_appliesFloor() throws Exception {
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"tax","expression":"price * 0.1","roundingPolicy":"floor"}
            ]}]}""");
        JsonNode formData = parse("{\"price\":99.0}");

        Map<String, Object> result = CalculationEngine.apply(projection, formData);
        assertEquals(9.0, ((Number) result.get("tax")).doubleValue(), 0.01);
    }

    @Test
    void apply_nullFormData_returnsEmptyMap() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"calculationRules\":[]}]}");
        Map<String, Object> result = CalculationEngine.apply(projection, null);
        assertNotNull(result);
    }

    // ── Circular dependency detection ─────────────────────────────────────────

    @Test
    void apply_circularDependency_throwsCircularDependencyException() {
        // r1: a = b; r2: b = a → circular
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"a","expression":"b"},
              {"id":"r2","targetField":"b","expression":"a"}
            ]}]}""");
        JsonNode formData = parse("{}");

        assertThrows(CircularDependencyException.class,
                () -> CalculationEngine.apply(projection, formData));
    }

    @Test
    void apply_circularDependency_exceptionContainsCycleInfo() {
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"x","expression":"y + 1"},
              {"id":"r2","targetField":"y","expression":"x + 1"}
            ]}]}""");
        JsonNode formData = parse("{}");

        CircularDependencyException ex = assertThrows(CircularDependencyException.class,
                () -> CalculationEngine.apply(projection, formData));
        assertNotNull(ex.getCycle());
        assertFalse(ex.getCycle().isEmpty());
    }

    @Test
    void apply_selfReference_throwsCircularDependencyException() {
        // r1: a = a + 1 → self-reference
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","calculationRules":[
              {"id":"r1","targetField":"a","expression":"a + 1"}
            ]}]}""");
        JsonNode formData = parse("{\"a\":0}");

        assertThrows(CircularDependencyException.class,
                () -> CalculationEngine.apply(projection, formData));
    }

    // ── No rules / no calculationRules key ───────────────────────────────────

    @Test
    void apply_missingCalculationRulesKey_returnsFormData() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\"}]}");
        JsonNode formData = parse("{\"x\":42}");
        Map<String, Object> result = CalculationEngine.apply(projection, formData);
        assertEquals(42.0, ((Number) result.get("x")).doubleValue(), 0.01);
    }

    @Test
    void apply_emptyProjection_returnsEmptyMap() throws Exception {
        Map<String, Object> result = CalculationEngine.apply(parse("{\"templates\":[]}"), parse("{}"));
        assertNotNull(result);
    }
}
