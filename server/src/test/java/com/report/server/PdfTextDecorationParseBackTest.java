package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for text style extras (#368): {@code style.backgroundColor} fill, {@code
 * fontStyle: italic} (synthetic shear), and {@code textDecoration} underline / line-through. These
 * live in TextPdfRenderer, so they also reach tenant text / pageNumber / currentDate (via #365).
 */
class PdfTextDecorationParseBackTest {

    private static String textEl(String style) {
        String el =
                """
            {"id":"t1","type":"text","content":"装飾テスト",
             "position":{"x":20,"y":20},"size":{"width":90,"height":14},
             "style":{"fontSize":12%s}}"""
                        .formatted(style);
        return """
            {"templates":[{
              "id":"t1","name":"Deco",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]}"""
                .formatted(el);
    }

    private static String content(String style) throws IOException {
        return PdfProbe.parse(PdfRenderer.render(textEl(style))).pageContent(0);
    }

    @Test
    void backgroundColor_fillsBox() throws IOException {
        assertTrue(
                content(",\"backgroundColor\":\"#eeeeee\"").contains("0.93333 0.93333 0.93333 sc"),
                "text background #eeeeee should fill the box");
    }

    @Test
    void italic_shearsTextMatrix() throws IOException {
        // synthetic italic sets a sheared text matrix: "1 0 0.21 1 tx ty Tm"
        assertTrue(content(",\"fontStyle\":\"italic\"").contains("0.21 1"), "italic should shear");
        assertFalse(content("").contains("0.21 1"), "upright text should not shear");
    }

    @Test
    void underline_strokesInTextColor() throws IOException {
        // underline strokes a line in the text color; a plain (fill-only) run of the same color
        // does not stroke, so the stroking token distinguishes them.
        assertTrue(
                content(",\"color\":\"#cc0000\",\"textDecoration\":\"underline\"")
                        .contains("0.8 0 0 SC"),
                "underline should stroke #cc0000");
        assertFalse(
                content(",\"color\":\"#cc0000\"").contains("0.8 0 0 SC"),
                "plain colored text should not stroke");
    }

    @Test
    void lineThrough_strokesInTextColor() throws IOException {
        assertTrue(
                content(",\"color\":\"#cc0000\",\"textDecoration\":\"line-through\"")
                        .contains("0.8 0 0 SC"),
                "line-through should stroke #cc0000");
    }
}
