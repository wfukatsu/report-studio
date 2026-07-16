package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for the V2-native render path (issue #52):
 * PdfRenderer.renderDefinition consumes a ReportDefinition directly,
 * preserving designed page boundaries.
 */
class PdfRenderDefinitionParseBackTest {

    @Test
    void multiplePages_renderAsSeparatePhysicalPages_noOverlap() throws IOException {
        String def = """
            {
              "id":"d1","metadata":{"documentName":"MultiPage"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
              "pages":[
                {"id":"p1","name":"1","width":210,"height":297,
                 "sections":[{"id":"s1","sectionType":"body","height":297,
                   "elements":[{"id":"e1","type":"text","content":"PAGE1ONLY",
                     "position":{"x":20,"y":20},"size":{"width":100,"height":10},
                     "style":{"fontSize":12}}]}]},
                {"id":"p2","name":"2","width":210,"height":297,
                 "sections":[{"id":"s2","sectionType":"body","height":297,
                   "elements":[{"id":"e2","type":"text","content":"PAGE2ONLY",
                     "position":{"x":20,"y":40},"size":{"width":100,"height":10},
                     "style":{"fontSize":12}}]}]}
              ]
            }""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(def));
        assertEquals(2, probe.pageCount());
        assertTrue(probe.pageContains(0, "PAGE1ONLY"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "PAGE2ONLY"), "page 2 content must not bleed onto page 1");
        assertTrue(probe.pageContains(1, "PAGE2ONLY"), probe.pageText(1));
        assertFalse(probe.pageContains(1, "PAGE1ONLY"));
    }

    @Test
    void eachPageUsesItsOwnSizeAndOrientation() throws IOException {
        // Page 1: A4 portrait (210×297), page 2: A3 landscape (420×297)
        String def = """
            {
              "id":"d1","metadata":{"documentName":"MixedSize"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
              "pages":[
                {"id":"p1","width":210,"height":297,
                 "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[]}]},
                {"id":"p2","width":420,"height":297,
                 "sections":[{"id":"s2","sectionType":"body","height":297,"elements":[]}]}
              ]
            }""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(def));
        assertEquals(2, probe.pageCount());
        assertEquals(210f, probe.pageWidthMm(0), 0.2f);
        assertEquals(297f, probe.pageHeightMm(0), 0.2f);
        assertEquals(420f, probe.pageWidthMm(1), 0.2f);
        assertEquals(297f, probe.pageHeightMm(1), 0.2f);
    }

    @Test
    void detailOverflowWithinOnePage_expandsToPhysicalPages() throws IOException {
        // One designed page whose detail_table has 12 rows, 5/page → 3 physical
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= 12; i++) {
            if (i > 1) items.append(',');
            items.append("{\"name\":\"品目").append(i).append("\"}");
        }
        String def = """
            {
              "id":"d1","metadata":{"documentName":"Overflow"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
              "pages":[{"id":"p1","width":210,"height":297,
                "sections":[{"id":"detail","sectionType":"body","type":"detail_table",
                  "y":20,"height":52,"repeatHeader":true,
                  "elements":[
                    {"id":"col","kind":"text","frame":{"x":15,"y":22,"width":80,"height":7,"rotation":0},
                     "props":{"text":"品名","fontSize":9}},
                    {"id":"row","kind":"row_block","frame":{"x":15,"y":32,"width":80,"height":8,"rotation":0},
                     "bindingRef":"items[].name","props":{"fontSize":9}}]}]}],
              "_formData":{"items":[%s]}
            }""".formatted(items);
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(def));
        assertEquals(3, probe.pageCount());
        assertTrue(probe.pageContains(0, "品目1"), probe.pageText(0));
        assertTrue(probe.pageContains(2, "品目12"), probe.pageText(2));
    }

    @Test
    void coverPlusOverflow_totalPagesAccumulateAcrossDesignedPages() throws IOException {
        // Page 1: cover (1 physical). Page 2: detail 8 rows, 5/page → 2 physical.
        // Total = 3 physical; {{page}}/{{pages}} runs 1..3.
        StringBuilder items = new StringBuilder();
        for (int i = 1; i <= 8; i++) {
            if (i > 1) items.append(',');
            items.append("{\"v\":\"R").append(i).append("\"}");
        }
        String def = """
            {
              "id":"d1","metadata":{"documentName":"CoverOverflow"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
              "pages":[
                {"id":"cover","width":210,"height":297,
                 "sections":[{"id":"c","sectionType":"body","height":297,
                   "elements":[
                     {"id":"title","type":"text","content":"表紙",
                      "position":{"x":80,"y":100},"size":{"width":60,"height":12},"style":{"fontSize":18}},
                     {"id":"pn1","type":"pageNumber","format":"{{page}} / {{pages}}",
                      "position":{"x":90,"y":285},"size":{"width":30,"height":8},"style":{"fontSize":10}}]}]},
                {"id":"body","width":210,"height":297,
                 "sections":[
                   {"id":"detail","sectionType":"body","type":"detail_table","y":20,"height":52,
                    "elements":[
                      {"id":"row","kind":"row_block","frame":{"x":15,"y":32,"width":40,"height":8,"rotation":0},
                       "bindingRef":"items[].v","props":{"fontSize":9}}]},
                   {"id":"footer","sectionType":"body","type":"page_base","y":280,"height":15,
                    "elements":[
                      {"id":"pn2","type":"pageNumber","format":"{{page}} / {{pages}}",
                       "position":{"x":90,"y":285},"size":{"width":30,"height":8},"style":{"fontSize":10}}]}]}
              ],
              "_formData":{"items":[%s]}
            }""".formatted(items);
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(def));
        assertEquals(3, probe.pageCount());
        assertTrue(probe.pageContains(0, "1 / 3"), probe.pageText(0));  // cover
        assertTrue(probe.pageContains(1, "2 / 3"), probe.pageText(1));  // detail page 1
        assertTrue(probe.pageContains(2, "3 / 3"), probe.pageText(2));  // detail page 2
    }

    @Test
    void variantMasking_appliesViaOutputVariants() throws IOException {
        // V2 outputVariant shape: id, hiddenElementIds[], maskingRules[].type
        String def = """
            {
              "id":"d1","metadata":{"documentName":"Variant"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
              "outputVariants":[{
                "id":"ext","name":"社外",
                "hiddenElementIds":["secret"],
                "maskingRules":[{"targetElementId":"acct","type":"partial","keepFirst":2,"keepLast":2}]
              }],
              "pages":[{"id":"p1","width":210,"height":297,
                "sections":[{"id":"s1","sectionType":"body","height":297,
                  "elements":[
                    {"id":"acct","kind":"text","frame":{"x":20,"y":20,"width":100,"height":8,"rotation":0},
                     "props":{"text":"1234567890","fontSize":12}},
                    {"id":"secret","kind":"text","frame":{"x":20,"y":40,"width":100,"height":8,"rotation":0},
                     "props":{"text":"SECRETVALUE","fontSize":12}}]}]}],
              "_variantId":"ext"
            }""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(def));
        assertTrue(probe.pageContains(0, "12******90"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "1234567890"));
        assertFalse(probe.pageContains(0, "SECRETVALUE"), "hidden element must not render");
    }

    @Test
    void emptyPages_produceOneBlankPageSizedFromSettings() throws IOException {
        String def = """
            {"id":"d1","metadata":{},"pageSettings":{"paperSize":"A3","orientation":"landscape","unit":"mm"},
             "pages":[]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(def));
        assertEquals(1, probe.pageCount());
        // A3 landscape ≈ 420×297mm
        assertEquals(420f, probe.pageWidthMm(0), 1f);
        assertEquals(297f, probe.pageHeightMm(0), 1f);
    }
}
