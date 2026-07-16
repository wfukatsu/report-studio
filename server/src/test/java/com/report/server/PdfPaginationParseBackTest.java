package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for section pagination (issues #59/#55).
 *
 * <p>Covers height-derived row capacity, page-count math, header repetition,
 * row rendering across pages (row_block), independent pagination of multiple
 * repeating sections, and unit-based multi_row_table flow.
 */
class PdfPaginationParseBackTest {

    /**
     * detail_table with 12 rows. Section y=20, rows start at y=32 with 8mm
     * stride; {@code sectionHeight} controls the height-derived capacity:
     * height 92 → bottom edge 112 → (112−32)/8 = 10 rows/page.
     */
    private static String detailTableJson(String extraSectionFields, int sectionHeight) {
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= 12; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"品目").append(i).append("\",\"amount\":\"").append(i * 100).append("\"}");
        }
        return """
            {"templates":[{
              "id":"t1","name":"Pagination",
              "sections":[{
                "id":"detail","type":"detail_table","name":"明細","y":20,"height":%d,
                %s
                "elements":[
                  {"id":"col-name","kind":"text","name":"品名見出し",
                   "frame":{"x":15,"y":22,"width":80,"height":7,"rotation":0},
                   "props":{"text":"品名","fontSize":9}},
                  {"id":"row-name","kind":"row_block","name":"品名行",
                   "frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                   "bindingRef":"items[].name","props":{"fontSize":9}}
                ]
              }]
            }],
            "_formData":{"items":[%s]}}""".formatted(sectionHeight, extraSectionFields, items);
    }

    // ── Page-count math ─────────────────────────────────────────────────

    @Test
    void heightDerivedCapacity_tenRowsPerPage_yieldsTwoPages() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,", 92)));
        assertEquals(2, probe.pageCount());
    }

    @Test
    void heightDerivedCapacity_fiveRowsPerPage_yieldsThreePages() throws IOException {
        // Bottom edge 72 → (72−32)/8 = 5 rows/page → ceil(12/5) = 3 pages
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,", 52)));
        assertEquals(3, probe.pageCount());
        assertTrue(probe.pageContains(2, "品目11"), probe.pageText(2));
        assertTrue(probe.pageContains(2, "品目12"), probe.pageText(2));
    }

    @Test
    void fixedRowMode_fixedRowCountOverridesGeometry() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(
                detailTableJson("\"tableMode\":\"fixed\",\"fixedRowCount\":5,", 92)));
        // ceil(12 / 5) = 3 pages even though geometry would allow 10/page
        assertEquals(3, probe.pageCount());
    }

    // ── Header repetition ───────────────────────────────────────────────

    @Test
    void repeatHeader_true_rendersHeaderOnAllPages() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,", 92)));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "品名"), probe.pageText(1));
    }

    @Test
    void repeatHeader_false_rendersHeaderOnlyOnFirstPage() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("", 92)));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertFalse(probe.pageContains(1, "品名"), probe.pageText(1));
    }

    // ── Row rendering across pages (row_block, issue #55) ──────────────

    @Test
    void rowData_rendersOnCorrectPagesAtCorrectPositions() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,", 92)));

        // Page 0: rows 1–10; page 1: rows 11–12
        assertTrue(probe.pageContains(0, "品目1"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "品目10"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "品目11"));
        assertTrue(probe.pageContains(1, "品目11"), probe.pageText(1));
        assertTrue(probe.pageContains(1, "品目12"));

        // Row 1 at y=32; row 2 one 8mm stride below
        PdfProbe.TextRun row1 = probe.findRun(0, "品目1").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(32, 9), row1.baselineYMm(), 0.5f);
        PdfProbe.TextRun row2 = probe.findRun(0, "品目2").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(40, 9), row2.baselineYMm(), 0.5f);

        // Page 1 restarts at the top of the row region: row 11 back at y=32
        PdfProbe.TextRun row11 = probe.findRun(1, "品目11").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(32, 9), row11.baselineYMm(), 0.5f);
        PdfProbe.TextRun row12 = probe.findRun(1, "品目12").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(40, 9), row12.baselineYMm(), 0.5f);
    }

    // ── Independent pagination of multiple repeating sections ──────────

    @Test
    void twoRepeatingSections_paginateIndependently() throws IOException {
        // Table A: 12 rows, 10/page → 2 pages. Table B: 8 rows, 2/page → 4 pages.
        // Document = max(2, 4) = 4 pages; A must stop after page 2.
        StringBuilder itemsA = new StringBuilder();
        for (int i = 1; i <= 12; i++) {
            if (i > 1) itemsA.append(',');
            itemsA.append("{\"name\":\"A品目").append(i).append("\"}");
        }
        StringBuilder itemsB = new StringBuilder();
        for (int i = 1; i <= 8; i++) {
            if (i > 1) itemsB.append(',');
            itemsB.append("{\"name\":\"B備考").append(i).append("\"}");
        }
        String json = """
            {"templates":[{
              "id":"t1","name":"TwoTables",
              "sections":[
                {"id":"tableA","type":"detail_table","name":"明細A","y":20,"height":92,
                 "repeatHeader":true,
                 "elements":[
                   {"id":"a-head","kind":"text","name":"A見出し",
                    "frame":{"x":15,"y":22,"width":80,"height":7,"rotation":0},
                    "props":{"text":"A表","fontSize":9}},
                   {"id":"a-row","kind":"row_block","name":"A行",
                    "frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                    "bindingRef":"itemsA[].name","props":{"fontSize":9}}]},
                {"id":"tableB","type":"detail_table","name":"明細B","y":150,"height":26,
                 "repeatHeader":true,
                 "elements":[
                   {"id":"b-head","kind":"text","name":"B見出し",
                    "frame":{"x":15,"y":152,"width":80,"height":7,"rotation":0},
                    "props":{"text":"B表","fontSize":9}},
                   {"id":"b-row","kind":"row_block","name":"B行",
                    "frame":{"x":15,"y":160,"width":80,"height":8,"rotation":0},
                    "bindingRef":"itemsB[].name","props":{"fontSize":9}}]}
              ]
            }],
            "_formData":{"itemsA":[%s],"itemsB":[%s]}}""".formatted(itemsA, itemsB);

        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertEquals(4, probe.pageCount());

        // A: rows on pages 0–1, nothing (not even its header) on pages 2–3
        assertTrue(probe.pageContains(0, "A品目1"));
        assertTrue(probe.pageContains(1, "A品目12"));
        assertFalse(probe.pageContains(2, "A品目"), probe.pageText(2));
        assertFalse(probe.pageContains(2, "A表"), probe.pageText(2));

        // B: 2 rows per page across all 4 pages
        assertTrue(probe.pageContains(0, "B備考1"));
        assertTrue(probe.pageContains(0, "B備考2"));
        assertFalse(probe.pageContains(0, "B備考3"));
        assertTrue(probe.pageContains(3, "B備考7"));
        assertTrue(probe.pageContains(3, "B備考8"));
    }

    // ── multi_row_table: unit-based flow (issue #55) ────────────────────

    @Test
    void multiRowTable_unitsAdvanceByUnitExtentAndNeverSplit() throws IOException {
        // Unit = two 10mm rows at y=40/50 → extent 20mm. Section bottom edge 80
        // → capacity floor((80−40)/20) = 2 units/page. 3 records → 2 pages.
        String json = """
            {"templates":[{
              "id":"t1","name":"MultiRowUnits",
              "sections":[{
                "id":"units","type":"multi_row_table","name":"ユニット","y":30,"height":50,
                "rowUnitSize":2,"splitPolicy":"forbidden","continuationHeader":true,
                "elements":[
                  {"id":"head","kind":"text","name":"見出し",
                   "frame":{"x":15,"y":32,"width":80,"height":6,"rotation":0},
                   "props":{"text":"記録一覧","fontSize":9}},
                  {"id":"row-name","kind":"row_block","name":"名前行",
                   "frame":{"x":15,"y":40,"width":80,"height":10,"rotation":0},
                   "bindingRef":"records[].name","props":{"fontSize":9}},
                  {"id":"row-desc","kind":"row_block","name":"説明行",
                   "frame":{"x":15,"y":50,"width":80,"height":10,"rotation":0},
                   "bindingRef":"records[].desc","props":{"fontSize":9}}
                ]
              }]
            }],
            "_formData":{"records":[
              {"name":"記録一","desc":"説明一"},
              {"name":"記録二","desc":"説明二"},
              {"name":"記録三","desc":"説明三"}
            ]}}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertEquals(2, probe.pageCount());

        // Page 0: units 1–2. Unit 2 advances by the 20mm unit extent (not the
        // 10mm element height): name at y=60, desc at y=70.
        PdfProbe.TextRun name2 = probe.findRun(0, "記録二").orElseThrow(
                () -> new AssertionError(probe.dumpRuns()));
        assertEquals(PdfProbe.expectedBaselineYMm(60, 9), name2.baselineYMm(), 0.5f);
        PdfProbe.TextRun desc2 = probe.findRun(0, "説明二").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(70, 9), desc2.baselineYMm(), 0.5f);

        // Unit 3 must NOT split: both of its rows are on page 1, back at the top
        assertFalse(probe.pageContains(0, "記録三"));
        assertTrue(probe.pageContains(1, "記録三"), probe.pageText(1));
        assertTrue(probe.pageContains(1, "説明三"));
        PdfProbe.TextRun name3 = probe.findRun(1, "記録三").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(40, 9), name3.baselineYMm(), 0.5f);
    }
}
