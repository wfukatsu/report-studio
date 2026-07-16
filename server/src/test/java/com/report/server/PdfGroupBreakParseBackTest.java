package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for group page-breaks in detail_table sections
 * (issue #55 phase 3): {@code groupBy} forces each group onto a fresh page.
 */
class PdfGroupBreakParseBackTest {

    /**
     * detail_table grouped by "dept". Section geometry fits 10 rows/page, so
     * grouping (not capacity) drives the page breaks.
     */
    private static String grouped(String extraSectionFields, String items) {
        return """
            {"templates":[{
              "id":"t1","name":"Grouped",
              "sections":[{
                "id":"detail","type":"detail_table","name":"明細","y":20,"height":92,
                "groupBy":"dept",%s
                "elements":[
                  {"id":"gh","kind":"group_header","name":"部門見出し",
                   "frame":{"x":15,"y":22,"width":120,"height":7,"rotation":0},
                   "prefix":"部門: ","style":{"fontSize":10,"bold":true}},
                  {"id":"row","kind":"row_block","name":"氏名行",
                   "frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                   "bindingRef":"people[].name","props":{"fontSize":9}}]}]}],
              "_formData":{"people":[%s]}}""".formatted(extraSectionFields, items);
    }

    @Test
    void groupBoundaries_forcePageBreaks() throws IOException {
        // 2 depts (営業 ×2, 開発 ×3) → 2 pages, one per group, despite fitting on one
        String items = "{\"dept\":\"営業\",\"name\":\"田中\"},{\"dept\":\"営業\",\"name\":\"鈴木\"},"
                + "{\"dept\":\"開発\",\"name\":\"佐藤\"},{\"dept\":\"開発\",\"name\":\"高橋\"},"
                + "{\"dept\":\"開発\",\"name\":\"渡辺\"}";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(grouped("", items)));
        assertEquals(2, probe.pageCount());
        // Page 0 = 営業 group only, page 1 = 開発 group only
        assertTrue(probe.pageContains(0, "田中") && probe.pageContains(0, "鈴木"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "佐藤"), "開発 must not share 営業's page");
        assertTrue(probe.pageContains(1, "佐藤") && probe.pageContains(1, "渡辺"), probe.pageText(1));
        assertFalse(probe.pageContains(1, "田中"));
    }

    @Test
    void groupHeader_rendersGroupValueOnEachGroupPage() throws IOException {
        String items = "{\"dept\":\"営業\",\"name\":\"田中\"},{\"dept\":\"開発\",\"name\":\"佐藤\"}";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(grouped("", items)));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(0, "部門: 営業"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "部門: 開発"), probe.pageText(1));
        assertFalse(probe.pageContains(0, "部門: 開発"));
    }

    @Test
    void groupRows_startAtTopOfEachGroupPage() throws IOException {
        // Second group's first row must sit at the row region top (y=32mm),
        // not offset by its global data index.
        String items = "{\"dept\":\"A\",\"name\":\"a1\"},{\"dept\":\"A\",\"name\":\"a2\"},"
                + "{\"dept\":\"B\",\"name\":\"b1\"}";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(grouped("", items)));
        PdfProbe.TextRun a1 = probe.findRun(0, "a1").orElseThrow();
        PdfProbe.TextRun b1 = probe.findRun(1, "b1").orElseThrow();
        // both first-rows of their group start at the same Y (top of row region)
        assertEquals(a1.baselineYMm(), b1.baselineYMm(), 0.5f);
        assertEquals(PdfProbe.expectedBaselineYMm(32, 9), b1.baselineYMm(), 0.5f);
    }

    @Test
    void largeGroup_paginatesWithinItself_thenBreaksToNextGroup() throws IOException {
        // Section fits 5 rows/page (height 52). Group A has 7 rows → 2 pages,
        // group B has 2 rows → 1 page. Total 3 pages.
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= 7; i++) items.append("{\"dept\":\"A\",\"name\":\"a").append(i).append("\"},");
        items.append("{\"dept\":\"B\",\"name\":\"b1\"},{\"dept\":\"B\",\"name\":\"b2\"}");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(
                grouped("\"height\":52,", items.toString()).replace("\"height\":92,", "")));
        assertEquals(3, probe.pageCount());
        assertTrue(probe.pageContains(0, "a1") && probe.pageContains(0, "a5"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "a6") && probe.pageContains(1, "a7"), probe.pageText(1));
        assertFalse(probe.pageContains(1, "b1"), "group B must not share group A's continuation page");
        assertTrue(probe.pageContains(2, "b1") && probe.pageContains(2, "b2"), probe.pageText(2));
    }

    @Test
    void withoutGroupBy_behavesAsFlatPagination() throws IOException {
        // Same data, no groupBy → single page (5 rows fit in height 92)
        String items = "{\"dept\":\"A\",\"name\":\"x1\"},{\"dept\":\"B\",\"name\":\"x2\"}";
        String json = grouped("", items).replace("\"groupBy\":\"dept\",", "");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertEquals(1, probe.pageCount());
        assertTrue(probe.pageContains(0, "x1") && probe.pageContains(0, "x2"));
    }
}
