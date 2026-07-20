package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for carry-over totals (繰越小計, issue #55 phase 2).
 *
 * <p>12 rows (amounts 100..1200), 5 rows per page → 3 pages. Page sums: rows 1–5 = 1,500; rows 1–10
 * = 5,500; total 7,800.
 */
class PdfCarryOverParseBackTest {

    private static PdfProbe probe;

    @BeforeAll
    static void render() throws IOException {
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= 12; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"品目")
                    .append(i)
                    .append("\",\"amount\":")
                    .append(i * 100)
                    .append("}");
        }
        // Section bottom edge 72, rows start 32, stride 8 → 5 rows/page
        String json =
                """
            {"templates":[{
              "id":"t1","name":"CarryOver",
              "sections":[{
                "id":"detail","type":"detail_table","name":"明細","y":20,"height":52,
                "repeatHeader":true,
                "elements":[
                  {"id":"col","kind":"text","name":"見出し",
                   "frame":{"x":15,"y":22,"width":80,"height":7,"rotation":0},
                   "props":{"text":"品名","fontSize":9}},
                  {"id":"carry-in","kind":"carryover_header","name":"前頁繰越",
                   "frame":{"x":110,"y":22,"width":70,"height":7,"rotation":0},
                   "carryField":"amount","prefix":"前頁より繰越 ",
                   "format":{"type":"comma"},"style":{"fontSize":9,"textAlign":"right"}},
                  {"id":"row-name","kind":"row_block","name":"行",
                   "frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                   "bindingRef":"items[].name","props":{"fontSize":9}},
                  {"id":"row-amount","kind":"row_block","name":"金額行",
                   "frame":{"x":110,"y":32,"width":70,"height":8,"rotation":0},
                   "bindingRef":"items[].amount","props":{"fontSize":9,"align":"right"}},
                  {"id":"carry-out","kind":"carryover_footer","name":"次頁繰越",
                   "frame":{"x":110,"y":75,"width":70,"height":7,"rotation":0},
                   "carryField":"amount","prefix":"次頁へ続く 小計 ",
                   "format":{"type":"comma"},"style":{"fontSize":9,"textAlign":"right"}}
                ]
              }]
            }],
            "_formData":{"items":[%s]}}"""
                        .formatted(items);
        probe = PdfProbe.parse(PdfRenderer.render(json));
    }

    @Test
    void twelveRowsFiveGeometryDerivedPerPage_yieldThreePages() {
        assertEquals(3, probe.pageCount());
    }

    @Test
    void firstPage_showsToBeContinuedButNoBroughtForward() {
        assertTrue(probe.pageContains(0, "次頁へ続く 小計 1,500"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "前頁より繰越"), probe.pageText(0));
    }

    @Test
    void middlePage_showsBothCarriedAndContinuedTotals() {
        assertTrue(probe.pageContains(1, "前頁より繰越 1,500"), probe.pageText(1));
        assertTrue(probe.pageContains(1, "次頁へ続く 小計 5,500"), probe.pageText(1));
    }

    @Test
    void finalPage_showsBroughtForwardButNoToBeContinued() {
        assertTrue(probe.pageContains(2, "前頁より繰越 5,500"), probe.pageText(2));
        assertFalse(probe.pageContains(2, "次頁へ続く"), probe.pageText(2));
    }

    @Test
    void carryOverElements_renderAtTheirOwnFrames() {
        // Footer at y=75mm with 9pt font — below the row region
        PdfProbe.TextRun footer = probe.findRun(0, "次頁へ続く").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(75, 9), footer.baselineYMm(), 0.5f);
        // Header at y=22mm on continuation pages
        PdfProbe.TextRun header = probe.findRun(1, "前頁より繰越").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(22, 9), header.baselineYMm(), 0.5f);
    }

    @Test
    void singlePageTable_rendersNoCarryOverAtAll() throws IOException {
        String json =
                """
            {"templates":[{
              "id":"t1","name":"OnePage",
              "sections":[{
                "id":"detail","type":"detail_table","name":"明細","y":20,"height":100,
                "elements":[
                  {"id":"row","kind":"row_block","name":"行",
                   "frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                   "bindingRef":"items[].amount","props":{"fontSize":9}},
                  {"id":"carry-out","kind":"carryover_footer","name":"次頁繰越",
                   "frame":{"x":110,"y":115,"width":70,"height":7,"rotation":0},
                   "carryField":"amount","prefix":"次頁へ続く ","style":{"fontSize":9}}
                ]
              }]
            }],
            "_formData":{"items":[{"amount":100},{"amount":200}]}}""";
        PdfProbe p = PdfProbe.parse(PdfRenderer.render(json));
        assertEquals(1, p.pageCount());
        assertFalse(p.pageContains(0, "次頁へ続く"), p.pageText(0));
    }
}
