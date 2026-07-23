package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for the #373 remainder: the hanko font-size model (viewBox-scaled, not raw mm)
 * and the eraSelect marker-to-label gap (drawn separately, mirroring the frontend 0.3mm flex gap).
 */
class PdfMiscParity2ParseBackTest {

    @Test
    void hanko_fontSizeUsesViewBoxScale() throws IOException {
        // 20mm box, fontSize 10 → frontend effective size = 10 * 3.78/100 * 20mm ≈ 21.4pt
        // (the old model used 10mm * MM_TO_PT ≈ 28.3pt, i.e. far too large).
        String json =
                """
            {"templates":[{
              "id":"t1","name":"Hanko",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"h1","type":"hanko","name":"印",
                  "position":{"x":150,"y":30},"size":{"width":20,"height":20},
                  "text":"印","shape":"circle","borderColor":"#cc0000","textColor":"#cc0000",
                  "fontSize":10,"writingMode":"horizontal-tb"
                }]
              }]
            }]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        PdfProbe.TextRun run = probe.findRun(0, "印").orElseThrow();
        assertEquals(
                21.4f, run.fontSizePt(), 1.0f, "hanko should use the viewBox-scaled font size");
    }

    @Test
    void eraSelect_marker_and_label_drawnSeparately() throws IOException {
        // The marker and era are now separate glyph runs (0.3mm gap), so no single run is "●平".
        String json =
                """
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
            }],"_formData":{"birth.era":"平"}}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "平"), probe.pageText(0));
        // Each era now emits two text-show ops (marker + label) instead of one concatenated run;
        // 5 eras (明大昭平令) → ≥10 Tj operations.
        long tj = probe.pageContent(0).lines().filter(l -> l.trim().endsWith("Tj")).count();
        assertTrue(tj >= 10, "marker and label should be drawn separately, saw " + tj + " Tj ops");
    }
}
