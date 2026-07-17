package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for the V2 revenueStamp / approvalStampRow / eraSelect
 * renderers (issue #53).
 */
class PdfJapaneseStampParseBackTest {

    private static String pageWith(String element) {
        return """
            {"templates":[{
              "id":"t1","name":"Stamps",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]}""".formatted(element);
    }

    // ── revenueStamp ────────────────────────────────────────────────────

    @Test
    void revenueStamp_rendersLabelAmountAndCancellationGuide() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"r1","type":"revenueStamp","name":"印紙",
             "position":{"x":150,"y":20},"size":{"width":40,"height":25},
             "amount":"200円","borderColor":"#000000","borderWidth":0.3,
             "showLabel":true,"showCancellationGuide":true}""")));
        assertTrue(probe.pageContains(0, "収入印紙"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "200円"), probe.pageText(0));
        // Cancellation guide: dashed vertical line → dash pattern operator
        assertTrue(probe.pageContent(0).contains("] 0 d"), probe.pageContent(0));
    }

    @Test
    void revenueStamp_hidesLabelWhenDisabled() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"r1","type":"revenueStamp","name":"印紙",
             "position":{"x":150,"y":20},"size":{"width":40,"height":25},
             "showLabel":false,"showCancellationGuide":false}""")));
        assertFalse(probe.pageContains(0, "収入印紙"), probe.pageText(0));
        assertFalse(probe.pageContent(0).contains("] 0 d"), "guide should be absent");
    }

    // ── approvalStampRow ────────────────────────────────────────────────

    private static final String APPROVAL_ROW = """
        {"id":"a1","type":"approvalStampRow","name":"承認欄",
         "position":{"x":120,"y":15},"size":{"width":75,"height":20},
         "cells":[
           {"role":"担当","width":15},{"role":"係長","width":15},{"role":"課長","width":15},
           {"role":"部長","width":15},{"role":"社長","width":15}],
         "labelPosition":"%s","borderColor":"#000000","borderWidth":0.3,"cellHeight":15}""";

    @Test
    void approvalStampRow_rendersRoleLabelsInCellOrder() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(
                pageWith(APPROVAL_ROW.formatted("bottom"))));
        for (String role : new String[]{"担当", "係長", "課長", "部長", "社長"}) {
            assertTrue(probe.pageContains(0, role), "missing role: " + role);
        }
        PdfProbe.TextRun tanto = probe.findRun(0, "担当").orElseThrow();
        PdfProbe.TextRun shacho = probe.findRun(0, "社長").orElseThrow();
        assertTrue(tanto.xMm() < shacho.xMm(), "担当 must be the leftmost cell");
        // 社長 cell is the 5th of five 15mm cells starting at x=120mm → centered near 187.5mm
        assertEquals(187.5f, shacho.xMm() + 2.5f, 4.0f);
    }

    @Test
    void approvalStampRow_labelPositionControlsBandPlacement() throws IOException {
        PdfProbe top = PdfProbe.parse(PdfRenderer.render(pageWith(APPROVAL_ROW.formatted("top"))));
        PdfProbe bottom = PdfProbe.parse(PdfRenderer.render(pageWith(APPROVAL_ROW.formatted("bottom"))));
        // Element top y=15mm, height 20mm: top band label sits near the top edge,
        // bottom band label near the bottom edge.
        float topY = top.findRun(0, "課長").orElseThrow().baselineYMm();
        float bottomY = bottom.findRun(0, "課長").orElseThrow().baselineYMm();
        assertTrue(topY < 20f, "top-position label should be near y=15–19mm, got " + topY);
        assertTrue(bottomY > 30f, "bottom-position label should be near y=31–35mm, got " + bottomY);
    }

    // ── approvalStampRow stamp images (issue #74) ───────────────────────

    /** 1×1 transparent PNG. */
    private static final String STAMP_DATA_URI =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
            + "AAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    private static String approvalRowWithCells(String cellsJson) {
        return """
            {"id":"a1","type":"approvalStampRow","name":"承認欄",
             "position":{"x":120,"y":15},"size":{"width":45,"height":20},
             "cells":[%s],
             "labelPosition":"top","borderColor":"#000000","borderWidth":0.3,"cellHeight":15}"""
                .formatted(cellsJson);
    }

    private static int countImageDraws(PdfProbe probe) {
        String content = probe.pageContent(0);
        int count = 0;
        for (int i = content.indexOf(" Do"); i >= 0; i = content.indexOf(" Do", i + 1)) {
            count++;
        }
        return count;
    }

    @Test
    void approvalStampRow_rendersStampImageFromDataUri() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith(approvalRowWithCells("""
            {"role":"担当","width":15,"stampSrc":"%s"},
            {"role":"課長","width":15},
            {"role":"部長","width":15}""".formatted(STAMP_DATA_URI)))));
        // Stamp image → one XObject drawn via the "Do" operator
        assertEquals(1, countImageDraws(probe), probe.pageContent(0));
        // 85% opacity → an ExtGState is installed before the image
        assertTrue(probe.pageContent(0).contains(" gs"), probe.pageContent(0));
        // Labels are unaffected
        for (String role : new String[]{"担当", "課長", "部長"}) {
            assertTrue(probe.pageContains(0, role), "missing role: " + role);
        }
    }

    @Test
    void approvalStampRow_withoutStampSrc_drawsNoImage() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith(approvalRowWithCells("""
            {"role":"担当","width":15},{"role":"課長","width":15},{"role":"部長","width":15}"""))));
        assertEquals(0, countImageDraws(probe), probe.pageContent(0));
        assertTrue(probe.pageContains(0, "担当"));
    }

    @Test
    void approvalStampRow_invalidStampSrc_fallsBackToBlankCell() throws IOException {
        // Malformed base64 payload must not fail the PDF — the cell just stays blank
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith(approvalRowWithCells("""
            {"role":"担当","width":15,"stampSrc":"data:image/png;base64,!!!not-base64!!!"},
            {"role":"課長","width":15},
            {"role":"部長","width":15}"""))));
        assertEquals(0, countImageDraws(probe), probe.pageContent(0));
        for (String role : new String[]{"担当", "課長", "部長"}) {
            assertTrue(probe.pageContains(0, role), "missing role: " + role);
        }
    }

    @Test
    void approvalStampRow_brokenImageBytes_doNotAffectOtherCells() throws IOException {
        // Cell 1: valid base64 that is not an image (draw fails) — cell 2: valid stamp
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith(approvalRowWithCells("""
            {"role":"担当","width":15,"stampSrc":"data:image/png;base64,aGVsbG8="},
            {"role":"課長","width":15,"stampSrc":"%s"},
            {"role":"部長","width":15}""".formatted(STAMP_DATA_URI)))));
        assertEquals(1, countImageDraws(probe), probe.pageContent(0));
        assertTrue(probe.pageContains(0, "課長"));
    }

    // ── eraSelect (standalone) ──────────────────────────────────────────

    @Test
    void eraSelect_marksSelectedEraFromDataSource() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Era",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","type":"eraSelect","name":"元号",
                  "position":{"x":20,"y":20},"size":{"width":7,"height":12},
                  "layout":"column","dataSource":"birth.era"
                }]
              }]
            }],
            "_formData":{"birth.era":"平"}}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "●平"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "○昭"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "○令"), probe.pageText(0));

        // Column layout: 明 above 大 above 昭 … at the same X
        PdfProbe.TextRun mei = probe.findRun(0, "明").orElseThrow();
        PdfProbe.TextRun rei = probe.findRun(0, "令").orElseThrow();
        assertTrue(mei.baselineYMm() < rei.baselineYMm());
        assertEquals(mei.xMm(), rei.xMm(), 0.5f);
    }

    @Test
    void eraSelect_noSelectionRendersAllUnselected() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"e1","type":"eraSelect","name":"元号",
             "position":{"x":20,"y":20},"size":{"width":7,"height":12},"layout":"column"}""")));
        assertFalse(probe.pageText(0).contains("●"), probe.pageText(0));
        for (String era : new String[]{"明", "大", "昭", "平", "令"}) {
            assertTrue(probe.pageContains(0, "○" + era), probe.pageText(0));
        }
    }

    @Test
    void eraSelect_rowLayoutOrdersLeftToRight() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"e1","type":"eraSelect","name":"元号",
             "position":{"x":20,"y":20},"size":{"width":40,"height":5},
             "layout":"row","eras":["昭","平","令"]}""")));
        // Same-baseline items merge into one extracted run ("○昭○平○令"),
        // so assert the left-to-right order within the page text.
        String text = probe.pageText(0);
        assertTrue(text.contains("昭") && text.contains("令"), text);
        assertTrue(text.indexOf("昭") < text.indexOf("平"), text);
        assertTrue(text.indexOf("平") < text.indexOf("令"), text);
    }
}
