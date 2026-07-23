package com.report.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Tax-rate resolution and JEXL exposure (#333 Part 2). */
class TaxRatesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void defaultsMatchSharedGoldenFixture() throws Exception {
        // Enforces front/server parity: same fixture the front asserts against.
        Path fixture = Path.of("..", "src", "lib", "taxRatesGolden.json");
        assertTrue(
                Files.exists(fixture),
                "shared golden fixture missing: " + fixture.toAbsolutePath());
        JsonNode golden = MAPPER.readTree(Files.readString(fixture));
        assertEquals(golden.get("none").doubleValue(), TaxRates.DEFAULTS.get("none"));
        assertEquals(golden.get("standard").doubleValue(), TaxRates.DEFAULTS.get("standard"));
        assertEquals(golden.get("reduced").doubleValue(), TaxRates.DEFAULTS.get("reduced"));
    }

    @Test
    void resolveUsesDefaultsWhenNoTenant() {
        Map<String, Object> r = TaxRates.resolve((JsonNode) null);
        assertEquals(0.10, r.get("standard"));
        assertEquals(0.08, r.get("reduced"));
        assertEquals(0.0, r.get("none"));
    }

    @Test
    void resolveAppliesTenantOverridesAndKeepsOtherDefaults() throws Exception {
        JsonNode tenant = MAPPER.readTree("{\"taxRates\":{\"standard\":0.12}}");
        Map<String, Object> r = TaxRates.resolve(tenant);
        assertEquals(0.12, r.get("standard"));
        assertEquals(0.08, r.get("reduced"));
    }

    @Test
    void taxRatesIsAvailableToCalculationExpressions() throws Exception {
        JsonNode projection =
                MAPPER.readTree(
                        "{\"calculationRules\":[{\"key\":\"tax\",\"expression\":\"amount *"
                                + " taxRates.standard\"}]}");
        JsonNode formData = MAPPER.readTree("{\"amount\":1000}");
        Map<String, Object> out =
                CalculationEngine.apply(
                        projection, formData, Map.of("taxRates", TaxRates.resolve()));
        assertEquals(100.0, ((Number) out.get("tax")).doubleValue(), 1e-9);
        // The injected helper var must not leak into the enriched form data.
        assertFalse(out.containsKey("taxRates"));
    }

    @Test
    void bracketAccessByTaxTypeWorks() throws Exception {
        JsonNode projection =
                MAPPER.readTree(
                        "{\"calculationRules\":[{\"key\":\"tax\",\"expression\":\"amount *"
                                + " taxRates[taxType]\"}]}");
        JsonNode formData = MAPPER.readTree("{\"amount\":1000,\"taxType\":\"reduced\"}");
        Map<String, Object> out =
                CalculationEngine.apply(
                        projection, formData, Map.of("taxRates", TaxRates.resolve()));
        assertEquals(80.0, ((Number) out.get("tax")).doubleValue(), 1e-9);
    }
}
