package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for the standalone {@code checkbox} element (#356).
 *
 * <p>Pins frontend parity for {@code CheckboxRenderer}: the label is drawn, the {@code checkmark}
 * glyph is honored, the box is a square (side = element height, not the full frame width), and a
 * static unbound {@code checked:true} renders checked.
 */
class PdfCheckboxParseBackTest {

    /** A single checkbox element on an A4 page. Frame is 40mm × 6mm (wide, short). */
    private static String checkboxJson(String extraFields) {
        return """
            {"metadata":{"documentName":"CB","version":"1.0","reportType":"general"},
             "pageSettings":{"paperSize":"A4","orientation":"portrait","unit":"mm"},
             "pages":[{"id":"p1","name":"P1","width":210,"height":297,"background":"#fff",
               "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[
                 {"id":"cb","type":"checkbox","position":{"x":20,"y":20},
                  "size":{"width":40,"height":6},"zIndex":1,"visible":true,
                  "label":"同意する","labelPosition":"right"%s}
               ]}]}]}"""
                .formatted(extraFields);
    }

    @Test
    void label_isRendered() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(
                                checkboxJson(",\"checked\":false,\"checkmark\":\"✓\"")));
        assertTrue(probe.pageContains(0, "同意する"), probe.pageText(0));
    }

    @Test
    void staticCheckedUnbound_showsCheckmark() throws IOException {
        // #356: an unbound checked:true (no dataSource) must render the checkmark glyph.
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(
                                checkboxJson(",\"checked\":true,\"checkmark\":\"✓\"")));
        assertTrue(probe.pageContains(0, "✓"), probe.pageText(0));
    }

    @Test
    void uncheckedUnbound_hasNoCheckmark() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(
                                checkboxJson(",\"checked\":false,\"checkmark\":\"✓\"")));
        assertFalse(probe.pageContains(0, "✓"), probe.pageText(0));
    }

    @Test
    void checkmarkGlyph_respectsElementCheckmark() throws IOException {
        // #356: the el.checkmark glyph is used, not a fixed ✓.
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(
                                checkboxJson(",\"checked\":true,\"checkmark\":\"×\"")));
        assertTrue(probe.pageContains(0, "×"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "✓"), probe.pageText(0));
    }

    @Test
    void box_isSquareNotFullFrameWidth() throws IOException {
        // #356: the box side equals the element height (6mm), not the 40mm frame width.
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(
                                checkboxJson(",\"checked\":false,\"checkmark\":\"✓\"")));
        String reLine =
                probe.pageContent(0)
                        .lines()
                        .map(String::trim)
                        .filter(l -> l.endsWith(" re"))
                        .findFirst()
                        .orElseThrow(
                                () -> new AssertionError("no rect op:\n" + probe.pageContent(0)));
        String[] t = reLine.split("\\s+");
        float rw = Float.parseFloat(t[2]);
        float rh = Float.parseFloat(t[3]);
        assertEquals(rw, rh, 0.5f, "box should be square, got " + reLine);
        assertEquals(6f * 2.835f, rw, 1.0f, "box side should equal the 6mm element height");
    }
}
