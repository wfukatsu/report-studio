package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tax-type → rate resolution (issue #333 Part 2).
 *
 * <p>The tenant's {@code taxRates} document is the single source of truth for consumption-tax rates
 * (decimal fractions, {@code 0.10 == 10%}). {@link #resolve()} merges the statutory {@link
 * #DEFAULTS} with any tenant overrides and the result is injected into every JEXL
 * calculation/validation context under the {@code taxRates} variable, so templates reference {@code
 * taxRates.standard} / {@code taxRates[item.taxType]} instead of hard-coding rates.
 *
 * <p><strong>Parity:</strong> {@link #DEFAULTS} MUST match the front-end defaults in {@code
 * src/lib/taxRatesGolden.json}. Both sides assert against that fixture in tests.
 */
public final class TaxRates {

    private TaxRates() {}

    /** Statutory defaults — keep in sync with {@code src/lib/taxRatesGolden.json}. */
    public static final Map<String, Double> DEFAULTS =
            Map.of("none", 0.0, "standard", 0.10, "reduced", 0.08);

    private static final String[] TYPES = {"none", "standard", "reduced"};

    /** Effective rate map for the process-wide tenant (defaults + overrides). */
    public static Map<String, Object> resolve() {
        return resolve(TenantInfoProvider.get());
    }

    /** Effective rate map for a specific tenant document (defaults + overrides). */
    static Map<String, Object> resolve(JsonNode tenant) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String type : TYPES) out.put(type, DEFAULTS.get(type));
        if (tenant != null) {
            JsonNode rates = tenant.get("taxRates");
            if (rates != null && rates.isObject()) {
                for (String type : TYPES) {
                    JsonNode v = rates.get(type);
                    if (v != null && v.isNumber()) out.put(type, v.doubleValue());
                }
            }
        }
        return out;
    }
}
