package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * Cross-language contract tests for {@link ValueFormatter} (issues #53/#57). Mirrors the fixtures
 * in src/lib/numberFormatter.test.ts — if either side changes formatting behavior, this suite and
 * the frontend suite must agree.
 */
class ValueFormatterTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode fmt(String json) throws Exception {
        return MAPPER.readTree(json);
    }

    // ── 大字 (toKanjiNumeral) ───────────────────────────────────────────

    @Test
    void kanjiNumeral_mirrorsFrontendFixtures() {
        assertEquals("金零円也", ValueFormatter.toKanjiNumeral(0));
        assertEquals("金壱円也", ValueFormatter.toKanjiNumeral(1));
        assertEquals("金伍円也", ValueFormatter.toKanjiNumeral(5));
        assertEquals("金百円也", ValueFormatter.toKanjiNumeral(100));
        assertEquals("金千円也", ValueFormatter.toKanjiNumeral(1000));
        assertEquals("金壱万円也", ValueFormatter.toKanjiNumeral(10000));
        assertEquals("金百万円也", ValueFormatter.toKanjiNumeral(1000000));
        assertEquals("金百弐拾参万四千伍百六拾七円也", ValueFormatter.toKanjiNumeral(1234567));
    }

    @Test
    void kanjiNumeral_nonFiniteAndNegativePassThrough() {
        assertEquals("Infinity", ValueFormatter.toKanjiNumeral(Double.POSITIVE_INFINITY));
        assertEquals("-1", ValueFormatter.toKanjiNumeral(-1));
    }

    // ── 数値 (formatNumber) ─────────────────────────────────────────────

    @Test
    void formatNumber_mirrorsFrontendFixtures() {
        assertEquals("1235", ValueFormatter.formatNumber(1234.9, "integer", 0, null));
        assertEquals("1234.57", ValueFormatter.formatNumber(1234.5678, "decimal", 2, null));
        assertEquals("¥1,234", ValueFormatter.formatNumber(1234, "currency_jpy", 0, null));
        assertEquals("$1,234.50", ValueFormatter.formatNumber(1234.5, "currency_usd", 0, null));
        assertEquals("12.3%", ValueFormatter.formatNumber(0.1234, "percent", 1, null));
        assertEquals("1,234,567", ValueFormatter.formatNumber(1234567, "comma", 0, null));
        assertEquals("金千円也", ValueFormatter.formatNumber(1000, "kanji_numeral", 0, null));
        assertEquals("42", ValueFormatter.formatNumber(42, "custom", 0, null));
        assertEquals("99", ValueFormatter.formatNumber(99, "unknown_type", 0, null));
    }

    @Test
    void customPattern_mirrorsFrontendBehavior() {
        assertEquals("1,234.50", ValueFormatter.formatNumber(1234.5, "custom", 0, "#,##0.00"));
        assertEquals("¥1,235", ValueFormatter.formatNumber(1234.9, "custom", 0, "¥#,##0"));
        assertEquals("42.0", ValueFormatter.formatNumber(42, "custom", 0, "0.0"));
    }

    // ── 和暦 (formatWareki) ─────────────────────────────────────────────

    @Test
    void wareki_mirrorsFrontendFixtures() {
        assertEquals("令和8年4月1日", ValueFormatter.formatWareki(LocalDate.of(2026, 4, 1), false));
        assertEquals("R08.04.01", ValueFormatter.formatWareki(LocalDate.of(2026, 4, 1), true));
        assertEquals("平成31年4月30日", ValueFormatter.formatWareki(LocalDate.of(2019, 4, 30), false));
        assertEquals("令和元年5月1日", ValueFormatter.formatWareki(LocalDate.of(2019, 5, 1), false));
        assertEquals("昭和64年1月7日", ValueFormatter.formatWareki(LocalDate.of(1989, 1, 7), false));
    }

    // ── 日付 (formatDate) ───────────────────────────────────────────────

    @Test
    void formatDate_mirrorsFrontendFixtures() {
        LocalDate d = LocalDate.of(2026, 4, 1);
        assertEquals("2026/04/01", ValueFormatter.formatDate(d, "yyyy/MM/dd", null));
        assertEquals("2026年4月1日", ValueFormatter.formatDate(d, "yyyy年MM月dd日", null));
        assertEquals(
                "04/15/2026",
                ValueFormatter.formatDate(LocalDate.of(2026, 4, 15), "MM/dd/yyyy", null));
        assertEquals("令和8年4月1日", ValueFormatter.formatDate(d, "wareki_full", null));
        assertEquals("R08.04.01", ValueFormatter.formatDate(d, "wareki_short", null));
        assertEquals(
                "2026-04-15",
                ValueFormatter.formatDate(LocalDate.of(2026, 4, 15), "custom", "yyyy-MM-dd"));
    }

    // ── 汎用 (applyFormat) ──────────────────────────────────────────────

    @Test
    void applyFormat_nullAndMissingReturnEmpty() throws Exception {
        assertEquals("", ValueFormatter.applyFormat(null, fmt("{\"type\":\"integer\"}")));
        assertEquals(
                "", ValueFormatter.applyFormat(MAPPER.nullNode(), fmt("{\"type\":\"integer\"}")));
    }

    @Test
    void applyFormat_dateStringWithDateType() throws Exception {
        assertEquals(
                "令和8年4月1日",
                ValueFormatter.applyFormat(
                        fmt("\"2026-04-01\""), fmt("{\"type\":\"wareki_full\"}")));
        assertEquals(
                "2026/04/01",
                ValueFormatter.applyFormat(
                        fmt("\"2026/04/01\""), fmt("{\"type\":\"yyyy/MM/dd\"}")));
    }

    @Test
    void applyFormat_numericStringWithNumberType() throws Exception {
        assertEquals(
                "1,000", ValueFormatter.applyFormat(fmt("\"1000\""), fmt("{\"type\":\"comma\"}")));
        assertEquals(
                "¥1,234",
                ValueFormatter.applyFormat(fmt("1234"), fmt("{\"type\":\"currency_jpy\"}")));
    }

    @Test
    void applyFormat_nonNumericStringPassesThrough() throws Exception {
        assertEquals(
                "hello",
                ValueFormatter.applyFormat(fmt("\"hello\""), fmt("{\"type\":\"integer\"}")));
        assertEquals(
                "not-a-date",
                ValueFormatter.applyFormat(
                        fmt("\"not-a-date\""), fmt("{\"type\":\"yyyy/MM/dd\"}")));
    }

    @Test
    void applyFormat_addressObject() throws Exception {
        JsonNode addr =
                fmt(
                        """
            {"postalCode":"100-0001","address1":"東京都千代田区千代田1-1","address2":"皇居ビル2F"}""");
        assertEquals(
                "〒100-0001 東京都千代田区千代田1-1皇居ビル2F",
                ValueFormatter.applyFormat(addr, fmt("{\"type\":\"address_single\"}")));
        assertEquals(
                "〒100-0001\n東京都千代田区千代田1-1\n皇居ビル2F",
                ValueFormatter.applyFormat(addr, fmt("{\"type\":\"address_multiline\"}")));
    }

    @Test
    void applyFormat_withoutFormatReturnsRawString() throws Exception {
        assertEquals("1234567", ValueFormatter.applyFormat(fmt("1234567"), null));
        assertEquals("テキスト", ValueFormatter.applyFormat(fmt("\"テキスト\""), null));
    }
}
