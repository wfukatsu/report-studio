package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for V2 repeatingBand / repeatingList page flow (issue #64): records beyond the
 * element frame flow onto continuation pages instead of being silently clipped; maxItems truncation
 * stays a designer choice.
 */
class PdfBandFlowParseBackTest {

    /**
     * A5-landscape-ish page with a repeatingBand: size.height 40, header 8 + itemHeight 8 →
     * capacity floor((40−8)/8) = 4 rows/page.
     */
    private static String bandJson(int records, String extraBandFields) {
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= records; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"品目").append(i).append("\"}");
        }
        return """
            {"id":"t1",
             "metadata":{"documentName":"BandFlow","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait",
               "margins":{"top":10,"right":10,"bottom":10,"left":10},"unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#fff",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[
                 {"id":"title","type":"text","position":{"x":10,"y":5},
                  "size":{"width":100,"height":8},"zIndex":1,"locked":false,"visible":true,
                  "content":"バンド見出し","style":{}},
                 {"id":"band","type":"repeatingBand","position":{"x":10,"y":20},
                  "size":{"width":120,"height":40},"zIndex":2,"locked":false,"visible":true,
                  "dataSource":"items","itemHeight":8,"showHeader":true,%s
                  "fields":[{"key":"name","label":"品名","width":60}],
                  "showFooter":false,"totals":[],"pageBreak":"none",
                  "oddRowColor":"#fff","evenRowColor":"#fff",
                  "borderColor":"#000","borderWidth":0.3}
               ]}]}],
             "testData":{"items":[%s]}}"""
                .formatted(extraBandFields, items);
    }

    @Test
    void recordsBeyondCapacity_flowToContinuationPages() throws IOException {
        // 10 records / 4 per page → 3 pages
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(10, "\"maxItems\":0,")));
        assertEquals(3, probe.pageCount());
        assertTrue(probe.pageContains(0, "品目1"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "品目4"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "品目5"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "品目5"), probe.pageText(1));
        assertTrue(probe.pageContains(1, "品目8"), probe.pageText(1));
        assertTrue(probe.pageContains(2, "品目9"), probe.pageText(2));
        assertTrue(probe.pageContains(2, "品目10"), probe.pageText(2));
    }

    @Test
    void headerRepeatsOnContinuationPages() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(10, "\"maxItems\":0,")));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "品名"), probe.pageText(1));
        assertTrue(probe.pageContains(2, "品名"), probe.pageText(2));
    }

    @Test
    void staticElements_repeatOnEveryPage() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(10, "\"maxItems\":0,")));
        assertTrue(probe.pageContains(0, "バンド見出し"), probe.pageText(0));
        assertTrue(probe.pageContains(2, "バンド見出し"), probe.pageText(2));
    }

    @Test
    void maxItemsTruncation_doesNotFlow() throws IOException {
        // 100 records but maxItems 4 → everything fits page 0, single page
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(100, "\"maxItems\":4,")));
        assertEquals(1, probe.pageCount());
        assertTrue(probe.pageContains(0, "品目4"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "品目5"), probe.pageText(0));
    }

    @Test
    void maxItemsBeyondCapacity_flowsTheCappedSet() throws IOException {
        // maxItems 6 of 100 → 2 pages (4 + 2), 品目7 never renders
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(100, "\"maxItems\":6,")));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(1, "品目6"), probe.pageText(1));
        assertFalse(probe.pageContains(1, "品目7"), probe.pageText(1));
    }

    @Test
    void allRecordsFit_singlePage() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(3, "\"maxItems\":0,")));
        assertEquals(1, probe.pageCount());
        assertTrue(probe.pageContains(0, "品目3"), probe.pageText(0));
    }

    // ── repeatingList (vertical) ─────────────────────────────────────────

    private static String listJson(int records, String layout) {
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= records; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"カード").append(i).append("\"}");
        }
        return """
            {"id":"t2",
             "metadata":{"documentName":"ListFlow","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait",
               "margins":{"top":10,"right":10,"bottom":10,"left":10},"unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#fff",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[
                 {"id":"list","type":"repeatingList","position":{"x":10,"y":20},
                  "size":{"width":120,"height":44},"zIndex":1,"locked":false,"visible":true,
                  "dataSource":"items","layout":"%s","gridColumns":2,
                  "itemWidth":50,"itemHeight":20,"gap":2,"maxItems":0,"pageBreak":"none",
                  "fields":[{"id":"f1","key":"name","x":2,"y":2,"width":45,"height":6}]}
               ]}]}],
             "testData":{"items":[%s]}}"""
                .formatted(layout, items);
    }

    @Test
    void verticalList_flowsAcrossPages() throws IOException {
        // capacity floor((44+2)/(20+2)) = 2 → 5 cards = 3 pages
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(listJson(5, "vertical")));
        assertEquals(3, probe.pageCount());
        assertTrue(probe.pageContains(0, "カード2"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "カード3"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "カード3"), probe.pageText(1));
        assertTrue(probe.pageContains(2, "カード5"), probe.pageText(2));
    }

    @Test
    void gridList_keepsHistoricalClipBehavior() throws IOException {
        // grid layout does not flow — single page, overflow clipped
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(listJson(9, "grid")));
        assertEquals(1, probe.pageCount());
    }

    @Test
    void emptyBoundBand_isSuppressed() throws IOException {
        // #371: a repeatingBand bound to an empty array renders nothing (no header/frame),
        // matching the preview; static siblings are unaffected.
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(0, "\"maxItems\":0,")));
        assertTrue(probe.pageContains(0, "バンド見出し"), "static text should still render");
        assertFalse(probe.pageContains(0, "品名"), "empty band header should be suppressed");
    }

    @Test
    void nonEmptyBand_stillRendersHeader() throws IOException {
        // Control: a bound band with rows keeps its header (suppression is not over-eager).
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.renderDefinition(bandJson(3, "\"maxItems\":0,")));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "品目1"), probe.pageText(0));
    }
}
