package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for repeatingList card styling (#370): {@code itemBackground}, {@code
 * borderColor}/{@code borderWidth} (border drawn only when a color is set), {@code borderRadius}
 * (rounded corners), and per-field {@code fontWeight}.
 */
class PdfRepeatingListStyleParseBackTest {

    private static final String PEOPLE = "{\"people\":[{\"name\":\"田中太郎\"}]}";

    /** A one-card repeatingList; {@code extra} injects card-style props. */
    private static String listJson(String extra) {
        String el =
                """
            {"id":"l1","type":"repeatingList","name":"名簿","dataSource":"people",
             "layout":"vertical","itemWidth":80,"itemHeight":15,"gap":2%s,
             "fields":[{"key":"name","x":2,"y":2,"width":60,
               "style":{"fontSize":10,"fontWeight":"bold"}}],
             "position":{"x":15,"y":20},"size":{"width":100,"height":60}}"""
                        .formatted(extra);
        return """
            {"templates":[{
              "id":"t1","name":"List",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }],"_formData":%s}"""
                .formatted(el, PEOPLE);
    }

    private static String content(String extra) throws IOException {
        return PdfProbe.parse(PdfRenderer.render(listJson(extra))).pageContent(0);
    }

    @Test
    void itemBackground_fillsCard() throws IOException {
        assertTrue(
                content(",\"itemBackground\":\"#eeeeee\"").contains("0.93333 0.93333 0.93333 sc"),
                "card should fill itemBackground #eeeeee");
    }

    @Test
    void borderColor_drawsBorder() throws IOException {
        assertTrue(
                content(",\"borderColor\":\"#cc0000\"").contains("0.8 0 0 SC"),
                "card border should stroke #cc0000");
    }

    @Test
    void noBorderColor_drawsNoDefaultBorder() throws IOException {
        // Frontend: borderStyle is 'none' unless borderColor is set — so the old always-on
        // gray (#E5E7EB ≈ 0.898…) must be gone.
        assertFalse(content("").contains("0.898"), "no card border expected without borderColor");
    }

    @Test
    void borderRadius_usesCurves() throws IOException {
        // Rounded corners are drawn with Bézier curves → 'c' operators appear.
        String c = content(",\"borderColor\":\"#000000\",\"borderRadius\":2");
        assertTrue(
                c.lines().anyMatch(l -> l.trim().endsWith(" c")),
                "borderRadius should emit curve operators");
    }

    @Test
    void fieldFontWeightBold_usesBoldFace() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(listJson("")));
        PdfProbe.TextRun run = probe.findRun(0, "田中太郎").orElseThrow();
        assertTrue(run.fontName().contains("NotoSansJP-Bold"), run.fontName());
    }
}
