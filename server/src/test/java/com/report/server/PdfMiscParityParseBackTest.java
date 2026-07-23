package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.pdf.PdfUtils;
import com.report.server.testsupport.PdfProbe;
import java.awt.Color;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Assorted parity fixes (#373): {@link PdfUtils#parseColor} alpha-hex / rgb() support, the V2
 * {@code page.background} fill, and the text default font size (10pt, matching the frontend).
 */
class PdfMiscParityParseBackTest {

    // ── parseColor: alpha hex + rgb()/rgba() (previously fell back to black) ──

    @Test
    void parseColor_handlesAlphaHexAndRgb() {
        assertEquals(new Color(255, 0, 0), PdfUtils.parseColor("#ff0000", Color.BLACK));
        assertEquals(new Color(255, 0, 0), PdfUtils.parseColor("#ff000080", Color.BLACK), "8-hex");
        assertEquals(new Color(255, 0, 0), PdfUtils.parseColor("#f00", Color.BLACK), "3-hex");
        assertEquals(new Color(255, 0, 0), PdfUtils.parseColor("#f008", Color.BLACK), "4-hex");
        assertEquals(new Color(204, 0, 0), PdfUtils.parseColor("rgb(204, 0, 0)", Color.BLACK));
        assertEquals(
                new Color(0, 0, 204), PdfUtils.parseColor("rgba(0, 0, 204, 0.5)", Color.BLACK));
        // still falls back for genuine garbage
        assertEquals(Color.BLACK, PdfUtils.parseColor("nonsense", Color.BLACK));
    }

    // ── page.background ──────────────────────────────────────────────────────

    @Test
    void pageBackground_fillsThePage() throws IOException {
        String json =
                """
            {"metadata":{"documentName":"BG","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#eeeeee",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[]}]}]}""";
        String content = PdfProbe.parse(PdfRenderer.renderDefinition(json)).pageContent(0);
        assertTrue(
                content.contains("0.93333 0.93333 0.93333 sc"),
                "page background #eeeeee should fill the page:\n" + content);
    }

    @Test
    void pageBackground_whiteIsNotPainted() throws IOException {
        String json =
                """
            {"metadata":{"documentName":"BG","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#ffffff",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[]}]}]}""";
        String content = PdfProbe.parse(PdfRenderer.renderDefinition(json)).pageContent(0);
        assertFalse(content.contains("1 1 1 sc"), "white background should not add a fill");
    }

    // ── text default font size = 10pt (frontend DEFAULT_FONT_SIZE) ────────────

    @Test
    void textElement_defaultsTo10pt() throws IOException {
        String json =
                """
            {"templates":[{
              "id":"t1","name":"Default",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"T",
                  "frame":{"x":20,"y":20,"width":80,"height":10,"rotation":0},
                  "props":{"text":"既定サイズ"}
                }]
              }]
            }]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        PdfProbe.TextRun run = probe.findRun(0, "既定サイズ").orElseThrow();
        assertEquals(10f, run.fontSizePt(), 0.01f, "unsized text should default to 10pt");
    }
}
