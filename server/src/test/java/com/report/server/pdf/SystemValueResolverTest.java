package com.report.server.pdf;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link SystemValueResolver} (issue #54) — mirrors the frontend formatters in
 * src/elements/pageNumber/format.ts and src/elements/currentDate/format.ts.
 */
class SystemValueResolverTest {

    // ── pageNumber ──────────────────────────────────────────────────────

    @Test
    void pageNumber_formatStringIsTheTemplate() {
        assertEquals("3", SystemValueResolver.formatPageNumber("{{page}}", null, 3, 7));
        assertEquals(
                "3 / 7", SystemValueResolver.formatPageNumber("{{page}} / {{pages}}", null, 3, 7));
        assertEquals("- 3 -", SystemValueResolver.formatPageNumber("- {{page}} -", null, 3, 7));
        assertEquals(
                "3ページ (全7ページ)",
                SystemValueResolver.formatPageNumber("{{page}}ページ (全{{pages}}ページ)", null, 3, 7));
    }

    @Test
    void pageNumber_customUsesCustomFormat() {
        assertEquals(
                "P3/7",
                SystemValueResolver.formatPageNumber("custom", "P{{page}}/{{pages}}", 3, 7));
        // custom without a pattern falls back to {{page}}
        assertEquals("3", SystemValueResolver.formatPageNumber("custom", null, 3, 7));
        assertEquals("3", SystemValueResolver.formatPageNumber(null, null, 3, 7));
    }

    // ── currentDate (zero-padded dialect) ───────────────────────────────

    @Test
    void currentDate_mirrorsFrontendFormats() {
        LocalDate d = LocalDate.of(2026, 7, 16); // 木曜日
        assertEquals("2026/07/16", SystemValueResolver.formatCurrentDate("yyyy/MM/dd", null, d));
        assertEquals("2026年07月16日", SystemValueResolver.formatCurrentDate("yyyy年MM月dd日", null, d));
        assertEquals("2026-07-16", SystemValueResolver.formatCurrentDate("yyyy-MM-dd", null, d));
        assertEquals("07/16/2026", SystemValueResolver.formatCurrentDate("MM/dd/yyyy", null, d));
        assertEquals("令和8年07月16日", SystemValueResolver.formatCurrentDate("wareki_full", null, d));
        assertEquals("R8.07.16", SystemValueResolver.formatCurrentDate("wareki_short", null, d));
        assertEquals(
                "2026年07月16日 (木)",
                SystemValueResolver.formatCurrentDate("yyyy年MM月dd日 (ddd)", null, d));
    }

    @Test
    void currentDate_customPatternWithDayOfWeek() {
        LocalDate d = LocalDate.of(2026, 7, 16);
        assertEquals(
                "2026.07.16", SystemValueResolver.formatCurrentDate("custom", "yyyy.MM.dd", d));
        assertEquals(
                "07/16 (木)", SystemValueResolver.formatCurrentDate("custom", "MM/dd (ddd)", d));
        // custom without a pattern falls back to yyyy/MM/dd
        assertEquals("2026/07/16", SystemValueResolver.formatCurrentDate("custom", null, d));
    }

    @Test
    void currentDate_unknownFormatFallsBackToSlashed() {
        assertEquals(
                "2026/07/16",
                SystemValueResolver.formatCurrentDate("bogus", null, LocalDate.of(2026, 7, 16)));
    }

    @Test
    void currentDate_reiwaGannen() {
        assertEquals(
                "令和1年05月01日",
                SystemValueResolver.formatCurrentDate(
                        "wareki_full", null, LocalDate.of(2019, 5, 1)));
    }
}
