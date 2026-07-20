package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for the V2 dataField renderer with server-side value formatting (issues
 * #53/#57).
 */
class PdfDataFieldParseBackTest {

    /** One V2 dataField element on an A4 page; root _formData supplies the values. */
    private static String pageWith(String element, String formData) {
        return """
            {"templates":[{
              "id":"t1","name":"DataField",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }],
            "_formData":{%s}}"""
                .formatted(element, formData);
    }

    @Test
    void fieldKey_resolvesFromRootFormData() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"顧客名","fieldKey":"customer.name",
             "position":{"x":20,"y":20},"size":{"width":100,"height":10},
             "style":{"fontSize":12}}""",
                                        "\"customer.name\":\"株式会社スカラー\"")));
        assertTrue(probe.pageContains(0, "株式会社スカラー"), probe.pageText(0));
    }

    @Test
    void currencyFormat_appliesToBoundNumber() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"合計","fieldKey":"quote.total",
             "position":{"x":20,"y":20},"size":{"width":60,"height":10},
             "format":{"type":"currency_jpy"},
             "style":{"fontSize":14}}""",
                                        "\"quote.total\":1234567")));
        assertTrue(probe.pageContains(0, "¥1,234,567"), probe.pageText(0));
    }

    @Test
    void warekiFormat_appliesToBoundDateString() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"発行日","fieldKey":"quote.date",
             "position":{"x":20,"y":20},"size":{"width":60,"height":10},
             "format":{"type":"wareki_full"}}""",
                                        "\"quote.date\":\"2026-07-16\"")));
        assertTrue(probe.pageContains(0, "令和8年7月16日"), probe.pageText(0));
    }

    @Test
    void kanjiNumeralFormat_rendersDaiji() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"金額","fieldKey":"contract.amount",
             "position":{"x":20,"y":20},"size":{"width":120,"height":10},
             "format":{"type":"kanji_numeral"}}""",
                                        "\"contract.amount\":1000000")));
        assertTrue(probe.pageContains(0, "金百万円也"), probe.pageText(0));
    }

    @Test
    void missingValue_rendersFallbackText() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"担当者","fieldKey":"staff.name",
             "fallbackText":"（未定）",
             "position":{"x":20,"y":20},"size":{"width":60,"height":10}}""",
                                        "\"other.field\":\"x\"")));
        assertTrue(probe.pageContains(0, "（未定）"), probe.pageText(0));
    }

    @Test
    void missingValueWithoutFallback_rendersNothing() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"担当者","fieldKey":"staff.name",
             "position":{"x":20,"y":20},"size":{"width":60,"height":10}}""",
                                        "\"other.field\":\"x\"")));
        assertTrue(
                probe.runs(0).isEmpty(),
                "no placeholder text expected in production PDFs: " + probe.pageText(0));
    }

    @Test
    void rightAlign_positionsTextAtFrameRightEdge() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"金額","fieldKey":"amount",
             "position":{"x":20,"y":20},"size":{"width":60,"height":10},
             "format":{"type":"comma"},
             "style":{"fontSize":10,"textAlign":"right"}}""",
                                        "\"amount\":9999")));
        PdfProbe.TextRun run =
                probe.findRun(0, "9,999").orElseThrow(() -> new AssertionError(probe.dumpRuns()));
        // Frame right edge at x=80mm — right-aligned text must end near it
        assertTrue(
                run.xMm() > 65f && run.xMm() < 80f,
                "right-aligned run should start close to the right edge, got x=" + run.xMm());
    }

    @Test
    void styleColorAndBold_apply() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"d1","type":"dataField","name":"強調","fieldKey":"note",
             "position":{"x":20,"y":20},"size":{"width":100,"height":10},
             "style":{"fontSize":12,"bold":true,"color":"#cc0000"}}""",
                                        "\"note\":\"重要事項\"")));
        assertTrue(probe.pageContains(0, "重要事項"));
        // #cc0000 fill color → "0.8 0 0 sc" (non-stroking) in the content stream
        assertTrue(probe.pageContent(0).contains("0.8 0 0 sc"), probe.pageContent(0));
    }
}
