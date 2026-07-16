package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for multi_row_table splitPolicy (issue #55):
 * {@code forbidden} keeps whole units together; {@code allowed-between-rows}
 * lets a unit's physical rows straddle a page boundary.
 */
class PdfSplitPolicyParseBackTest {

    /**
     * multi_row_table: 2-row units (name at y=40, desc at y=50, each 10mm →
     * unit extent 20mm). Section y=30 height=50 → bottom edge 80, available
     * from region top (40) = 40mm. Physical-row height = 10mm.
     * forbidden: floor(40/20)=2 units/page. allowed: floor(40/10)=4 rows/page.
     */
    private static String json(String policy, int records) {
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= records; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"名前").append(i).append("\",\"desc\":\"説明").append(i).append("\"}");
        }
        return """
            {"templates":[{
              "id":"t1","name":"Split",
              "sections":[{
                "id":"units","type":"multi_row_table","name":"ユニット","y":30,"height":50,
                "rowUnitSize":2,"splitPolicy":"%s",
                "elements":[
                  {"id":"row-name","kind":"row_block","name":"名前行",
                   "frame":{"x":15,"y":40,"width":80,"height":10,"rotation":0},
                   "bindingRef":"records[].name","props":{"fontSize":9}},
                  {"id":"row-desc","kind":"row_block","name":"説明行",
                   "frame":{"x":15,"y":50,"width":80,"height":10,"rotation":0},
                   "bindingRef":"records[].desc","props":{"fontSize":9}}
                ]
              }]
            }],
            "_formData":{"records":[%s]}}""".formatted(policy, items);
    }

    @Test
    void forbidden_keepsUnitsWhole_thirdUnitMovesToNextPage() throws IOException {
        // 3 units, 2/page (whole units) → 2 pages; unit 3 entirely on page 1
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json("forbidden", 3)));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(0, "名前2") && probe.pageContains(0, "説明2"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "名前3"), "unit 3 must not start on page 1 (forbidden)");
        assertTrue(probe.pageContains(1, "名前3") && probe.pageContains(1, "説明3"), probe.pageText(1));
    }

    @Test
    void allowedBetweenRows_splitsUnitAcrossPageBoundary() throws IOException {
        // 3 units = 6 physical rows, 4 rows/page → 2 pages.
        // Page 1: unit1 (name1,desc1), unit2 (name2,desc2). Page 2: unit3.
        // The boundary falls exactly after unit2, so check a 5-row case below;
        // here verify all rows present and correct page distribution.
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json("allowed-between-rows", 3)));
        assertEquals(2, probe.pageCount());
        // 4 rows on page 0: name1,desc1,name2,desc2
        assertTrue(probe.pageContains(0, "説明2"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "名前3"));
        assertTrue(probe.pageContains(1, "名前3") && probe.pageContains(1, "説明3"));
    }

    @Test
    void allowedBetweenRows_unitStraddlesBoundary() throws IOException {
        // Shrink the page so 3 physical rows fit per page (height 40 → available
        // 30mm from region top 40; physRowH 10 → floor(30/10)=3 rows/page).
        // 2 units = 4 rows → page 1: name1,desc1,name2 ; page 2: desc2.
        // Unit 2 STRADDLES the boundary — its two rows are on different pages.
        String j = json("allowed-between-rows", 2).replace("\"height\":50,", "\"height\":40,");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(j));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(0, "名前2"), "unit 2's first row on page 1: " + probe.pageText(0));
        assertFalse(probe.pageContains(0, "説明2"), "unit 2's second row must spill to page 2");
        assertTrue(probe.pageContains(1, "説明2"), "unit 2's second row on page 2: " + probe.pageText(1));
        // Page 2's first row sits at the region top (y=40mm)
        PdfProbe.TextRun spill = probe.findRun(1, "説明2").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(40, 9), spill.baselineYMm(), 0.5f);
    }

    @Test
    void allowedInsideUnit_behavesLikeBetweenRows() throws IOException {
        String j = json("allowed-inside-unit", 2).replace("\"height\":50,", "\"height\":40,");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(j));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(0, "名前2"));
        assertTrue(probe.pageContains(1, "説明2"));
    }

    @Test
    void allowed_fitsAllRowsOnOnePageWhenSpaceAllows() throws IOException {
        // 2 units = 4 rows, page fits 4 → single page
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json("allowed-between-rows", 2)));
        assertEquals(1, probe.pageCount());
        assertTrue(probe.pageContains(0, "説明1") && probe.pageContains(0, "説明2"));
    }
}
