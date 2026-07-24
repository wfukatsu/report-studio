package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * #423: Cross-language parity tests for expression evaluation. Evaluates the shared fixture at
 * {@code schemas/expression-parity.json} — the same cases are asserted by {@code
 * src/lib/jexlParity.test.ts} against the frontend engine, so the editor test-run and server-side
 * evaluation cannot drift silently. Same pattern as TaxRatesTest (repo-root relative fixture).
 */
class ExpressionParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final double TOLERANCE = 1e-9;

    private static JsonNode loadFixture() throws Exception {
        Path fixture = Path.of("..", "schemas", "expression-parity.json");
        assertTrue(Files.exists(fixture), "shared fixture must exist: " + fixture);
        return MAPPER.readTree(Files.readString(fixture));
    }

    @Test
    void fixtureIsNotEmpty() throws Exception {
        assertTrue(loadFixture().path("cases").size() > 0);
    }

    @TestFactory
    List<DynamicTest> parityCases() throws Exception {
        JsonNode root = loadFixture();
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : root.path("cases")) {
            String name = c.path("name").asText();
            String expression = c.path("expression").asText();
            @SuppressWarnings("unchecked")
            Map<String, Object> context = MAPPER.convertValue(c.path("context"), Map.class);
            JsonNode expected = c.path("expected");
            tests.add(
                    DynamicTest.dynamicTest(
                            name,
                            () -> {
                                Object actual = ExpressionEngine.calculate(expression, context);
                                assertMatches(expected, actual, name);
                            }));
        }
        return tests;
    }

    private static void assertMatches(JsonNode expected, Object actual, String name) {
        if (expected.isNumber()) {
            assertInstanceOf(Number.class, actual, name + ": expected a number, got " + actual);
            assertEquals(
                    expected.asDouble(), ((Number) actual).doubleValue(), TOLERANCE, name);
        } else if (expected.isBoolean()) {
            assertEquals(expected.asBoolean(), actual, name);
        } else if (expected.isNull()) {
            assertNull(actual, name);
        } else {
            assertEquals(expected.asText(), String.valueOf(actual), name);
        }
    }
}
