package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for pushdown-layout auto page-break (issue #55).
 *
 * <p>A {@code free} section with {@code layoutMode: "relative"} whose pushdown
 * chain flows past the section bottom gains continuation pages; overflowing
 * elements render on their continuation page at the wrapped position, while
 * elements that fit the first page keep the historical repeat-on-every-page
 * behavior.
 */
class PdfPushdownParseBackTest {

    /**
     * Free section y=0 height=100 (mm), relative layout:
     * ヘッダA y=10 h=20 (static); 本文B anchored to A → effY 60 h=30 (fits);
     * 続きC anchored to B → effY 130 → overflows onto page 2 at y=30.
     */
    private static String overflowJson() {
        return """
            {"templates":[{
              "id":"t1","name":"Pushdown",
              "sections":[{
                "id":"flow","type":"free","name":"本文","y":0,"height":100,
                "layoutMode":"relative",
                "elements":[
                  {"id":"el-a","kind":"text","name":"A",
                   "frame":{"x":10,"y":10,"width":100,"height":20,"rotation":0},
                   "props":{"text":"ヘッダA","fontSize":10}},
                  {"id":"el-b","kind":"text","name":"B",
                   "frame":{"x":10,"y":40,"width":100,"height":30,"rotation":0},
                   "props":{"text":"本文B","fontSize":10,
                            "layout":{"anchorTo":"el-a","pushDown":true}}},
                  {"id":"el-c","kind":"text","name":"C",
                   "frame":{"x":10,"y":80,"width":100,"height":30,"rotation":0},
                   "props":{"text":"続きC","fontSize":10,
                            "layout":{"anchorTo":"el-b","pushDown":true}}}
                ]
              }]
            }]}""";
    }

    @Test
    void pushdownOverflow_addsContinuationPage() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(overflowJson()));
        assertEquals(2, probe.pageCount());
    }

    @Test
    void overflowingElement_rendersOnlyOnContinuationPage() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(overflowJson()));
        assertFalse(probe.pageContains(0, "続きC"), probe.pageText(0));
        assertTrue(probe.pageContains(1, "続きC"), probe.pageText(1));
    }

    @Test
    void fittingElements_keepRenderingOnFirstPage() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(overflowJson()));
        assertTrue(probe.pageContains(0, "ヘッダA"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "本文B"), probe.pageText(0));
    }

    @Test
    void noOverflow_staysSinglePage() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"NoOverflow",
              "sections":[{
                "id":"flow","type":"free","y":0,"height":200,"layoutMode":"relative",
                "elements":[
                  {"id":"el-a","kind":"text",
                   "frame":{"x":10,"y":10,"width":100,"height":20,"rotation":0},
                   "props":{"text":"ヘッダA","fontSize":10}},
                  {"id":"el-b","kind":"text",
                   "frame":{"x":10,"y":40,"width":100,"height":30,"rotation":0},
                   "props":{"text":"本文B","fontSize":10,
                            "layout":{"anchorTo":"el-a","pushDown":true}}}
                ]
              }]
            }]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertEquals(1, probe.pageCount());
    }

    @Test
    void absoluteSection_neverPaginates() throws IOException {
        // Same overflowing geometry but without layoutMode: relative — content
        // past the section bottom stays clipped/off-page (historical behavior).
        String json = overflowJson().replace("\"layoutMode\":\"relative\",", "");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertEquals(1, probe.pageCount());
    }
}
