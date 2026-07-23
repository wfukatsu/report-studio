package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for the #368 remainder: dataField background / italic / underline / vertical
 * writing, plus {@code textAlign:justify} (word-spacing) on text and dataField.
 */
class PdfTextExtrasParseBackTest {

    private static String page(String element, String formData) {
        return """
            {"templates":[{
              "id":"t1","name":"Extras",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]%s}"""
                .formatted(element, formData == null ? "" : ",\"_formData\":" + formData);
    }

    private static String dataField(String style) {
        return """
            {"id":"d1","type":"dataField","name":"F","fieldKey":"v",
             "position":{"x":20,"y":20},"size":{"width":90,"height":40},
             "style":{"fontSize":12%s}}"""
                .formatted(style);
    }

    private static String dfContent(String style, String value) throws IOException {
        String json = page(dataField(style), "{\"v\":\"" + value + "\"}");
        return PdfProbe.parse(PdfRenderer.render(json)).pageContent(0);
    }

    @Test
    void dataField_backgroundColor() throws IOException {
        String content = dfContent(",\"backgroundColor\":\"#eeeeee\"", "値");
        assertTrue(
                content.contains("0.93333 0.93333 0.93333 sc"), "dataField background should fill");
    }

    @Test
    void dataField_italicShears() throws IOException {
        assertTrue(dfContent(",\"fontStyle\":\"italic\"", "値").contains("0.21 1"), "should shear");
        assertFalse(dfContent("", "値").contains("0.21 1"), "upright should not shear");
    }

    @Test
    void dataField_underlineStrokes() throws IOException {
        assertTrue(
                dfContent(",\"color\":\"#cc0000\",\"textDecoration\":\"underline\"", "値")
                        .contains("0.8 0 0 SC"),
                "underline should stroke text color");
    }

    @Test
    void dataField_verticalWriting() throws IOException {
        String json = page(dataField(",\"writingMode\":\"vertical-rl\""), "{\"v\":\"縦書き表示\"}");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        var runs = probe.runs(0);
        assertTrue(runs.size() >= 3, "vertical text draws glyphs separately, got " + runs.size());
        // first two glyphs stack downward at (roughly) the same x
        assertTrue(
                runs.get(0).baselineYMm() < runs.get(1).baselineYMm(), "glyphs should stack down");
        assertEquals(runs.get(0).xMm(), runs.get(1).xMm(), 2.0f, "glyphs share a column x");
    }

    @Test
    void justify_setsWordSpacing() throws IOException {
        // A multi-word value wrapping to >1 line; non-last lines are justified via Tw.
        String el =
                """
            {"id":"t1","type":"text","content":"alpha beta gamma delta epsilon zeta eta",
             "position":{"x":20,"y":20},"size":{"width":40,"height":40},
             "style":{"fontSize":10,"textAlign":"justify"}}""";
        String content = PdfProbe.parse(PdfRenderer.render(page(el, null))).pageContent(0);
        assertTrue(content.contains(" Tw"), "justify should emit a word-spacing operator");
    }
}
