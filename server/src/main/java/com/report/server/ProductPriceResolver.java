package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;

/**
 * Resolves the applicable unit price for a product as-of a given date.
 *
 * <p>Resolution order:
 *
 * <ol>
 *   <li>Find the most-recent {@code priceHistory} entry whose {@code effectiveFrom} is ≤ {@code
 *       reportDate}.
 *   <li>If no matching entry exists (empty history or all entries are after the date), fall back to
 *       the product's current {@code unitPrice}.
 * </ol>
 *
 * <p>Performance: dates are parsed once per call outside the iteration loop.
 */
public final class ProductPriceResolver {

    private ProductPriceResolver() {}

    /**
     * Returns the price effective on {@code reportDate}, or {@code unitPrice} as fallback.
     *
     * @param product parsed product JSON node
     * @param reportDate the date to resolve the price for; if null, uses today
     */
    public static double resolvePrice(JsonNode product, LocalDate reportDate) {
        if (reportDate == null) reportDate = LocalDate.now();

        double unitPrice = product.path("unitPrice").asDouble(0.0);
        JsonNode history = product.path("priceHistory");
        if (!history.isArray() || history.size() == 0) {
            return unitPrice;
        }

        LocalDate bestDate = null;
        double bestPrice = unitPrice;

        for (JsonNode entry : history) {
            String effectiveFromStr = entry.path("effectiveFrom").asText(null);
            if (effectiveFromStr == null) continue;
            LocalDate entryDate;
            try {
                entryDate = LocalDate.parse(effectiveFromStr);
            } catch (Exception e) {
                continue; // skip malformed dates
            }
            if (!entryDate.isAfter(reportDate)) {
                if (bestDate == null || entryDate.isAfter(bestDate)) {
                    bestDate = entryDate;
                    bestPrice = entry.path("price").asDouble(unitPrice);
                }
            }
        }

        return bestPrice;
    }
}
