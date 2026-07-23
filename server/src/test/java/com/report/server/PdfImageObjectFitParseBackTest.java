package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for image {@code objectFit} and {@code opacity} (#366).
 *
 * <p>A 2×1 PNG (aspect 2.0) is drawn in a 20mm square box (aspect 1.0). The image draw matrix
 * ({@code <sx> 0 0 <sy> tx ty cm}) reveals how it was fitted; {@code cover} additionally clips;
 * {@code opacity < 1} emits a non-stroking alpha graphics state ({@code gs}).
 */
class PdfImageObjectFitParseBackTest {

    // 2×1 PNG (red|blue), base64
    private static final String PNG_2x1 =
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";

    private static final float BOX_PT = 20f * 2.8346f; // 20mm square

    private static String pageWithImage(String objectFit, String opacity) {
        String el =
                """
            {"id":"img","type":"image","name":"画像",
             "position":{"x":20,"y":20},"size":{"width":20,"height":20},
             "objectFit":"%s"%s,
             "props":{"src":"data:image/png;base64,%s"}}"""
                        .formatted(objectFit, opacity, PNG_2x1);
        return """
            {"templates":[{
              "id":"t1","name":"Img",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]}"""
                .formatted(el);
    }

    /** {sx, sy} of the image draw matrix (the {@code cm} preceding {@code Do}). */
    private static float[] imageScale(PdfProbe probe) {
        for (String raw : probe.pageContent(0).split("\n")) {
            String line = raw.trim();
            if (line.endsWith(" cm")) {
                String[] t = line.split("\\s+");
                if (t.length == 7) {
                    return new float[] {Float.parseFloat(t[0]), Float.parseFloat(t[3])};
                }
            }
        }
        throw new AssertionError("no image cm matrix:\n" + probe.pageContent(0));
    }

    @Test
    void fill_stretchesToBox() throws IOException {
        float[] s = imageScale(PdfProbe.parse(PdfRenderer.render(pageWithImage("fill", ""))));
        assertEquals(BOX_PT, s[0], 1.0f, "fill width = box");
        assertEquals(BOX_PT, s[1], 1.0f, "fill height = box (aspect ignored)");
    }

    @Test
    void contain_preservesAspectFitsInside() throws IOException {
        // aspect 2.0 in a square box → full width, half height, no clip.
        float[] s = imageScale(PdfProbe.parse(PdfRenderer.render(pageWithImage("contain", ""))));
        assertEquals(BOX_PT, s[0], 1.0f, "contain width = box");
        assertEquals(BOX_PT / 2f, s[1], 1.0f, "contain height = box/2");
    }

    @Test
    void cover_fillsBoxAndClips() throws IOException {
        // aspect 2.0 → full height, double width (overflows), clipped to the box.
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWithImage("cover", "")));
        float[] s = imageScale(probe);
        assertEquals(BOX_PT * 2f, s[0], 1.5f, "cover width = 2×box");
        assertEquals(BOX_PT, s[1], 1.0f, "cover height = box");
        // clip operator W on its own line (…re \n W \n n) restricts drawing to the box
        assertTrue(
                probe.pageContent(0).contains("\nW\n"),
                "cover should clip to the box:\n" + probe.pageContent(0));
    }

    @Test
    void opacity_appliesAlphaGraphicsState() throws IOException {
        String with =
                PdfProbe.parse(PdfRenderer.render(pageWithImage("contain", ",\"opacity\":0.5")))
                        .pageContent(0);
        String without =
                PdfProbe.parse(PdfRenderer.render(pageWithImage("contain", ""))).pageContent(0);
        assertTrue(with.contains(" gs"), "opacity<1 should set an alpha graphics state");
        assertFalse(without.contains(" gs"), "opaque image should not set a graphics state");
    }
}
