package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Golden-template regression test (issue #59).
 *
 * <p>Renders the quotation golden fixture (src/test/resources/golden/) and asserts extracted text,
 * positions, fonts, and page structure. Any renderer change that shifts coordinates, breaks CJK
 * output, or alters pagination fails here instead of surfacing as a manual designer-vs-PDF diff
 * (docs/issues/*-pdf-comparison-issues.md).
 */
class PdfGoldenTemplateTest {

    private static final float POS_TOL_MM = 0.5f;

    private static PdfProbe probe;

    @BeforeAll
    static void renderGolden() throws IOException {
        String json;
        try (InputStream is =
                PdfGoldenTemplateTest.class.getResourceAsStream(
                        "/golden/quotation-projection.json")) {
            assertNotNull(is, "golden fixture missing");
            json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
        probe = PdfProbe.parse(PdfRenderer.render(json));
    }

    @Test
    void paginatesTwelveItemsAcrossTwoA4Pages() {
        assertEquals(2, probe.pageCount());
        for (int p = 0; p < 2; p++) {
            assertEquals(210f, probe.pageWidthMm(p), 0.1f);
            assertEquals(297f, probe.pageHeightMm(p), 0.1f);
        }
    }

    @Test
    void titleRendersAtDesignPositionWithDesignFontSize() {
        PdfProbe.TextRun title =
                probe.findRun(0, "御見積書")
                        .orElseThrow(
                                () ->
                                        new AssertionError(
                                                "title missing; runs:\n" + probe.dumpRuns()));
        assertEquals(PdfProbe.expectedXMm(80), title.xMm(), POS_TOL_MM);
        assertEquals(PdfProbe.expectedBaselineYMm(15, 18), title.baselineYMm(), POS_TOL_MM);
        assertEquals(18f, title.fontSizePt(), 0.01f);
        assertTrue(title.fontName().contains("NotoSansJP"), title.fontName());
    }

    @Test
    void boundFieldsResolveFromFormData() {
        PdfProbe.TextRun customer = probe.findRun(0, "株式会社スカラー 御中").orElseThrow();
        assertEquals(PdfProbe.expectedXMm(15), customer.xMm(), POS_TOL_MM);

        PdfProbe.TextRun total = probe.findRun(0, "¥1,234,567").orElseThrow();
        assertEquals(14f, total.fontSizePt(), 0.01f);
    }

    @Test
    void warekiDateRenders() {
        assertTrue(probe.pageContains(0, "令和8年7月16日"), probe.pageText(0));
    }

    @Test
    void headerSectionAndColumnHeadersRepeatOnContinuationPage() {
        // page_base sections render on every page; repeatHeader:true repeats
        // the detail_table's column headers.
        assertTrue(probe.pageContains(1, "御見積書"));
        assertTrue(probe.pageContains(1, "品名"));
        assertTrue(probe.pageContains(1, "金額"));
    }

    @Test
    void detailRowsRenderAndFlowAcrossPages() {
        // Row rendering + height-derived pagination (issue #55): the section
        // bottom edge is 162mm and rows start at 82mm with an 8mm stride
        // → 10 rows on page 0, rows 11–12 on page 1 back at the region top.
        PdfProbe.TextRun first =
                probe.findRun(0, "基本設計支援")
                        .orElseThrow(
                                () ->
                                        new AssertionError(
                                                "row data missing; runs:\n" + probe.dumpRuns()));
        assertEquals(PdfProbe.expectedBaselineYMm(82, 9), first.baselineYMm(), 0.5f);
        assertTrue(probe.pageContains(0, "¥100,000"));
        assertTrue(probe.pageContains(0, "教育・引き継ぎ"));
        assertFalse(probe.pageContains(0, "プロジェクト管理"));

        PdfProbe.TextRun row11 = probe.findRun(1, "プロジェクト管理").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(82, 9), row11.baselineYMm(), 0.5f);
        assertTrue(probe.pageContains(1, "予備費"));
        assertTrue(probe.pageContains(1, "¥79,567"));
    }
}
