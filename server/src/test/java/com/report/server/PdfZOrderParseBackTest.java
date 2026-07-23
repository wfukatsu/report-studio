package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for element z-ordering in the PDF (#355).
 *
 * <p>The frontend paints elements in {@code zIndex} order ({@code SectionContainer} sorts by it;
 * {@code setZOrder} changes only the value, not the array). The renderer must sort by {@code
 * zIndex} before painting so overlap stacking matches the preview. Paint order is asserted via the
 * raw content stream — PDFBox 3 emits a stroking color as {@code R G B SC}, so the earlier-painted
 * line's color token appears first.
 */
class PdfZOrderParseBackTest {

    private static final String RED_SC = "0.8 0 0 SC"; // stroke #cc0000
    private static final String BLUE_SC = "0 0 0.8 SC"; // stroke #0000cc

    /**
     * Two fully-overlapping line shapes. {@code redZ}/{@code blueZ} set their zIndex; the array
     * order is always red-then-blue, so any deviation in paint order is due to zIndex sorting.
     */
    private static String twoLinesJson(int redZ, int blueZ) {
        return """
            {"metadata":{"documentName":"Z","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#fff",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[
                 {"id":"red","type":"shape","shape":"line","stroke":"#cc0000","strokeWidth":2,
                  "position":{"x":20,"y":20},"size":{"width":60,"height":2},
                  "zIndex":%d,"visible":true},
                 {"id":"blue","type":"shape","shape":"line","stroke":"#0000cc","strokeWidth":2,
                  "position":{"x":20,"y":20},"size":{"width":60,"height":2},
                  "zIndex":%d,"visible":true}
               ]}]}]}"""
                .formatted(redZ, blueZ);
    }

    @Test
    void higherZIndexPaintsLast_evenWhenEarlierInArray() throws IOException {
        // red is first in the array but has the higher zIndex → must paint AFTER blue.
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(twoLinesJson(5, 1)));
        String content = probe.pageContent(0);
        int red = content.indexOf(RED_SC);
        int blue = content.indexOf(BLUE_SC);
        assertTrue(red >= 0 && blue >= 0, "both stroke colors should be present:\n" + content);
        assertTrue(blue < red, "blue (zIndex 1) should paint before red (zIndex 5)");
    }

    @Test
    void equalZIndex_keepsArrayOrder() throws IOException {
        // Ties fall back to document order: red first in the array → red paints first.
        PdfProbe probe = PdfProbe.parse(PdfRenderer.renderDefinition(twoLinesJson(0, 0)));
        String content = probe.pageContent(0);
        int red = content.indexOf(RED_SC);
        int blue = content.indexOf(BLUE_SC);
        assertTrue(red >= 0 && blue >= 0, "both stroke colors should be present:\n" + content);
        assertTrue(red < blue, "equal zIndex should keep array order (red first)");
    }
}
