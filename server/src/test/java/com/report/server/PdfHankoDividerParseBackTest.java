package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for the V2 hanko / divider renderers (issue #53 wiring).
 *
 * <p>Hanko assertions use text extraction; divider assertions inspect the
 * page content stream (stroke color / line width / dash operators), since
 * pure graphics never appear in extracted text.
 */
class PdfHankoDividerParseBackTest {

    // ── hanko ───────────────────────────────────────────────────────────

    /** V2-shaped hanko element: fields at the element top level. */
    private static String hankoJson(String fields) {
        return """
            {"templates":[{
              "id":"t1","name":"Hanko",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"h1","type":"hanko","name":"印鑑",
                  "position":{"x":150,"y":30},"size":{"width":20,"height":20},
                  %s
                }]
              }]
            }]}""".formatted(fields);
    }

    @Test
    void verticalHanko_rendersEachCharacterExtractably() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(hankoJson("""
            "text":"山田","shape":"circle","borderColor":"#cc0000","textColor":"#cc0000",
            "fontSize":4,"writingMode":"vertical-rl","doubleBorder":true""")));
        assertTrue(probe.pageContains(0, "山"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "田"), probe.pageText(0));

        // Vertical stack: 山 must sit above 田 at the same X
        PdfProbe.TextRun yama = probe.findRun(0, "山").orElseThrow();
        PdfProbe.TextRun ta = probe.findRun(0, "田").orElseThrow();
        assertTrue(yama.baselineYMm() < ta.baselineYMm(),
                "山 (y=%.1f) should be above 田 (y=%.1f)".formatted(yama.baselineYMm(), ta.baselineYMm()));
        assertEquals(yama.xMm(), ta.xMm(), 0.5f);
    }

    @Test
    void horizontalHanko_rendersTextOnOneLine() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(hankoJson("""
            "text":"承認","shape":"rectangle","writingMode":"horizontal-tb","doubleBorder":false""")));
        assertTrue(probe.pageContains(0, "承認"), probe.pageText(0));
    }

    @Test
    void hanko_defaultsToInMark() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(hankoJson("\"shape\":\"circle\"")));
        assertTrue(probe.pageContains(0, "印"), probe.pageText(0));
    }

    @Test
    void hanko_bindingRefResolvesViaProps() throws IOException {
        // bindingRef resolution (SectionRenderHelper) injects props.text,
        // which must win over the design-time text field.
        String json = """
            {"templates":[{
              "id":"t1","name":"HankoBound",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"h1","type":"hanko","name":"印鑑",
                  "position":{"x":150,"y":30},"size":{"width":20,"height":20},
                  "text":"未承認","writingMode":"horizontal-tb",
                  "bindingRef":"approver.name"
                }]
              }]
            }],
            "_formData":{"approver.name":"佐藤"}}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "佐藤"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "未承認"));
    }

    @Test
    void hanko_strokesUseSealRed() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(hankoJson("""
            "text":"印","borderColor":"#cc0000","doubleBorder":true""")));
        // #cc0000 → PDFBox 3 emits "/DeviceRGB CS" + "0.8 0 0 SC" for the stroke color
        assertTrue(probe.pageContent(0).contains("0.8 0 0 SC"), probe.pageContent(0));
    }

    // ── divider ─────────────────────────────────────────────────────────

    /** V2-shaped divider element. */
    private static String dividerJson(String fields) {
        return """
            {"templates":[{
              "id":"t1","name":"Divider",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"d1","type":"divider","name":"区切り線",
                  "position":{"x":20,"y":100},"size":{"width":170,"height":0.5},
                  %s
                }]
              }]
            }]}""".formatted(fields);
    }

    @Test
    void solidDivider_strokesWithColorAndThickness() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(dividerJson("""
            "direction":"horizontal","color":"#cc0000","thickness":1,"dashStyle":"solid"
            """)));
        String content = probe.pageContent(0);
        assertTrue(content.contains("0.8 0 0 SC"), content);
        // thickness 1mm → 2.835pt line width
        assertTrue(content.contains("2.835 w") || content.contains("2.83 w"), content);
        // solid → no dash pattern operator with a non-empty array
        assertFalse(content.contains("] 0 d"), content);
    }

    @Test
    void dashedDivider_setsDashPattern() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(dividerJson("""
            "direction":"horizontal","color":"#000000","thickness":0.5,"dashStyle":"dashed"
            """)));
        // 4mm/2mm → [11.34 5.67] 0 d
        assertTrue(probe.pageContent(0).contains("] 0 d"), probe.pageContent(0));
    }

    @Test
    void verticalDivider_drawsAlongVerticalCenter() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(dividerJson("""
            "direction":"vertical","color":"#000000","thickness":0.3,"dashStyle":"solid"
            """)));
        // Element x=20mm w=170mm → center x = 105mm = 297.675pt; line from y(100mm) to y(100.5mm)
        String content = probe.pageContent(0);
        assertTrue(content.contains("297.67"), content);
    }
}
