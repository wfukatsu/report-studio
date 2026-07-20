package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** ProductPriceResolver — as-of-date price resolution over priceHistory (#222). */
class ProductPriceResolverTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void noHistory_fallsBackToUnitPrice() {
        JsonNode p = parse("{\"unitPrice\":1000}");
        assertEquals(
                1000.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 7, 20)), 0.001);
    }

    @Test
    void emptyHistory_fallsBackToUnitPrice() {
        JsonNode p = parse("{\"unitPrice\":1000,\"priceHistory\":[]}");
        assertEquals(
                1000.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 7, 20)), 0.001);
    }

    @Test
    void picksMostRecentEntryOnOrBeforeTheReportDate() {
        JsonNode p =
                parse(
                        "{\"unitPrice\":1000,\"priceHistory\":["
                                + "{\"effectiveFrom\":\"2026-01-01\",\"price\":800},"
                                + "{\"effectiveFrom\":\"2026-06-01\",\"price\":900}]}");
        // As of 2026-07-20 the June entry is the most recent applicable one.
        assertEquals(900.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 7, 20)), 0.001);
        // As of 2026-03-01 only the January entry applies.
        assertEquals(800.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 3, 1)), 0.001);
    }

    @Test
    void entryEffectiveExactlyOnReportDate_applies() {
        JsonNode p =
                parse(
                        "{\"unitPrice\":1000,\"priceHistory\":["
                                + "{\"effectiveFrom\":\"2026-06-01\",\"price\":900}]}");
        assertEquals(900.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 6, 1)), 0.001);
    }

    @Test
    void allEntriesAfterReportDate_fallsBackToUnitPrice() {
        JsonNode p =
                parse(
                        "{\"unitPrice\":1000,\"priceHistory\":["
                                + "{\"effectiveFrom\":\"2026-12-01\",\"price\":1200}]}");
        assertEquals(
                1000.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 7, 20)), 0.001);
    }

    @Test
    void malformedOrMissingDates_areSkipped() {
        JsonNode p =
                parse(
                        "{\"unitPrice\":1000,\"priceHistory\":["
                                + "{\"effectiveFrom\":\"not-a-date\",\"price\":50},"
                                + "{\"price\":60},"
                                + "{\"effectiveFrom\":\"2026-01-01\",\"price\":800}]}");
        assertEquals(800.0, ProductPriceResolver.resolvePrice(p, LocalDate.of(2026, 7, 20)), 0.001);
    }

    @Test
    void nullReportDate_usesTodayAndAppliesAPastEntry() {
        // An entry effective far in the past applies regardless of what "today" is.
        JsonNode p =
                parse(
                        "{\"unitPrice\":1000,\"priceHistory\":["
                                + "{\"effectiveFrom\":\"2000-01-01\",\"price\":42}]}");
        assertEquals(42.0, ProductPriceResolver.resolvePrice(p, null), 0.001);
    }
}
