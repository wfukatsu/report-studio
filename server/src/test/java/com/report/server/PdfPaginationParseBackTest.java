package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for detail_table pagination (issue #59).
 *
 * <p>Verifies page-count math and header repetition, and pins down the
 * currently-known data-loss gap in row rendering (row_block is a no-op
 * renderer — issues #53/#55).
 */
class PdfPaginationParseBackTest {

    /** detail_table with 12 rows; header text "品名"; row_blocks bound to items[]. */
    private static String detailTableJson(String extraSectionFields) {
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= 12; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"品目").append(i).append("\",\"amount\":\"").append(i * 100).append("\"}");
        }
        return """
            {"templates":[{
              "id":"t1","name":"Pagination",
              "sections":[{
                "id":"detail","type":"detail_table","name":"明細","y":20,"height":250,
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
            "_formData":{"items":[%s]}}""".formatted(extraSectionFields, items);
    }

    @Test
    void twelveRows_defaultTenPerPage_yieldTwoPages() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,")));
        assertEquals(2, probe.pageCount());
    }

    @Test
    void fixedRowMode_fixedRowCountDrivesPageCount() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(
                detailTableJson("\"tableMode\":\"fixed\",\"fixedRowCount\":5,")));
        // ceil(12 / 5) = 3 pages
        assertEquals(3, probe.pageCount());
    }

    @Test
    void repeatHeader_true_rendersHeaderOnAllPages() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,")));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "品名"), probe.pageText(1));
    }

    @Test
    void repeatHeader_false_rendersHeaderOnlyOnFirstPage() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("")));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertFalse(probe.pageContains(1, "品名"), probe.pageText(1));
    }

    @Test
    void rowData_isCurrentlyLost_rowBlockRendererIsNoOp() throws IOException {
        // KNOWN DATA-LOSS GAP (issues #53/#55): renderElementsForRow resolves each
        // row's value into props, but the registered "row_block" renderer is a
        // no-op, so none of the 12 bound rows produce any text in the PDF.
        // When row rendering is implemented, flip these assertions.
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("\"repeatHeader\":true,")));
        assertFalse(probe.allText().contains("品目1"),
                "row data unexpectedly rendered — row rendering has been implemented; "
                        + "update this characterization test: \n" + probe.dumpRuns());
        assertFalse(probe.allText().contains("品目12"));
    }
}
