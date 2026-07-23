package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for section stacking on the V2 native render path (#354).
 *
 * <p>Frontend {@code ElementBase.position} is section-relative and sections stack top-to-bottom by
 * their {@code height}. The renderer must add each section's cumulative top (sum of preceding
 * section heights) to element Y so a body element at {@code y=5} lands below the header section,
 * not overlapping it at the page top. (The legacy V1 {@code templates[]} path uses page-absolute
 * {@code page_base} overlays and is intentionally unaffected.)
 */
class PdfSectionOffsetParseBackTest {

    private static final float TOL_MM = 0.6f;
    private static final float HEADER_H = 40f;

    /**
     * A page with a 40mm header section above a body section; each holds one text element at y=5.
     */
    private static final String TWO_SECTION_JSON =
            """
        {"metadata":{"documentName":"Stacked","version":"1.0","reportType":"general"},
         "pageSettings":{"paperSize":"A4","orientation":"portrait",
           "margins":{"top":10,"right":10,"bottom":10,"left":10},"unit":"mm"},
         "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#fff",
           "sections":[
             {"id":"sh","sectionType":"header","height":40,"elements":[
               {"id":"eh","type":"text","position":{"x":20,"y":5},
                "size":{"width":100,"height":10},"zIndex":1,"visible":true,
                "content":"HEADERTEXT","style":{"fontSize":12}}
             ]},
             {"id":"sb","sectionType":"body","height":257,"elements":[
               {"id":"eb","type":"text","position":{"x":20,"y":5},
                "size":{"width":100,"height":10},"zIndex":1,"visible":true,
                "content":"BODYTEXT","style":{"fontSize":12}}
             ]}
           ]}]}""";

    @Test
    void bodyElement_offsetByPrecedingSectionHeight() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(TWO_SECTION_JSON));
        PdfProbe.TextRun header = probe.findRun(0, "HEADERTEXT").orElseThrow();
        PdfProbe.TextRun body = probe.findRun(0, "BODYTEXT").orElseThrow();

        // Header section is at offset 0: its y=5 element sits near the page top.
        assertEquals(PdfProbe.expectedBaselineYMm(5, 12), header.baselineYMm(), TOL_MM);
        // Body section starts at +40mm: its y=5 element sits at effective y=45mm.
        assertEquals(PdfProbe.expectedBaselineYMm(5 + HEADER_H, 12), body.baselineYMm(), TOL_MM);
        // Body is exactly one header-height below the header element.
        assertEquals(HEADER_H, body.baselineYMm() - header.baselineYMm(), TOL_MM);
    }

    @Test
    void singleSection_isUnchanged() throws IOException {
        // A single body section has offset 0 — element Y stays page-relative (no regression).
        String json =
                """
            {"metadata":{"documentName":"Single","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#fff",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[
                 {"id":"e1","type":"text","position":{"x":20,"y":30},
                  "size":{"width":100,"height":10},"zIndex":1,"visible":true,
                  "content":"SOLOTEXT","style":{"fontSize":12}}
               ]}]}]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(json));
        PdfProbe.TextRun run = probe.findRun(0, "SOLOTEXT").orElseThrow();
        assertEquals(PdfProbe.expectedBaselineYMm(30, 12), run.baselineYMm(), TOL_MM);
    }
}
