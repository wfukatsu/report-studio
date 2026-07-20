package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for render-time system values (issue #54): pageNumber / currentDate elements and
 * legacy {pageNumber}-style bindingRef substitution, with _printDate for deterministic output.
 */
class PdfSystemVariableParseBackTest {

    /**
     * Two-page document (detail_table with 4 rows, 2 per page) with a footer page_base section
     * containing the given elements.
     */
    private static String twoPagesWith(String footerElements) {
        return """
            {"templates":[{
              "id":"t1","name":"SysVars",
              "sections":[
                {"id":"detail","type":"detail_table","name":"明細","y":20,"height":28,
                 "elements":[
                   {"id":"row","kind":"row_block","name":"行",
                    "frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                    "bindingRef":"items[].name","props":{"fontSize":9}}]},
                {"id":"footer","type":"page_base","name":"フッター","y":280,"height":17,
                 "elements":[%s]}
              ]
            }],
            "_formData":{"items":[{"name":"甲"},{"name":"乙"},{"name":"丙"},{"name":"丁"}]},
            "_printDate":"2026-07-16"}"""
                .formatted(footerElements);
    }

    @Test
    void pageNumberElement_rendersCurrentAndTotalOnEveryPage() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                twoPagesWith(
                                        """
            {"id":"pn","type":"pageNumber","name":"ページ番号",
             "position":{"x":90,"y":282},"size":{"width":30,"height":8},
             "format":"{{page}} / {{pages}}","style":{"fontSize":10,"textAlign":"center"}}""")));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(0, "1 / 2"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "2 / 2"), probe.pageText(1));
        assertFalse(probe.pageContains(0, "2 / 2"));
    }

    @Test
    void currentDateElement_usesPrintDateWithWarekiFormat() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                twoPagesWith(
                                        """
            {"id":"cd","type":"currentDate","name":"発行日",
             "position":{"x":150,"y":282},"size":{"width":45,"height":8},
             "format":"wareki_full","style":{"fontSize":10}}""")));
        assertTrue(probe.pageContains(0, "令和8年07月16日"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "令和8年07月16日"), probe.pageText(1));
    }

    @Test
    void currentDateElement_dayOfWeekFormat() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                twoPagesWith(
                                        """
            {"id":"cd","type":"currentDate","name":"発行日",
             "position":{"x":140,"y":282},"size":{"width":55,"height":8},
             "format":"yyyy年MM月dd日 (ddd)","style":{"fontSize":10}}""")));
        // 2026-07-16 is a Thursday
        assertTrue(probe.pageContains(0, "2026年07月16日 (木)"), probe.pageText(0));
    }

    @Test
    void legacyBindingRefs_substitutePageAndDateValues() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                twoPagesWith(
                                        """
            {"id":"pn","kind":"text","name":"ページ",
             "frame":{"x":20,"y":282,"width":20,"height":8,"rotation":0},
             "bindingRef":"{pageNumber}","props":{"fontSize":10}},
            {"id":"tp","kind":"text","name":"総ページ",
             "frame":{"x":45,"y":282,"width":20,"height":8,"rotation":0},
             "bindingRef":"{totalPages}","props":{"fontSize":10}},
            {"id":"cd","kind":"text","name":"日付",
             "frame":{"x":70,"y":282,"width":40,"height":8,"rotation":0},
             "bindingRef":"{currentDate}","props":{"fontSize":10}}""")));
        assertTrue(probe.pageContains(0, "1"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "2026/07/16"), probe.pageText(0));
        PdfProbe.TextRun page2 = probe.findRun(1, "2").orElseThrow();
        assertEquals(20f, page2.xMm(), 1.0f, "page-number text should sit at x=20mm");
    }

    @Test
    void pageNumberOnSinglePageDocument_showsOneOfOne() throws IOException {
        String json =
                """
            {"templates":[{
              "id":"t1","name":"OnePage",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"pn","type":"pageNumber","name":"ページ番号",
                  "position":{"x":90,"y":282},"size":{"width":30,"height":8},
                  "format":"{{page}} / {{pages}}","style":{"fontSize":10}
                }]
              }]
            }]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "1 / 1"), probe.pageText(0));
    }
}
