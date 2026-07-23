package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for repeatingBand per-edge border overrides and cell wrapText (#372).
 *
 * <p>Header / data-row / column-divider borders resolve their own color+width (with the {@code
 * innerBorder* → border*} fallback), so distinct edge colors appear as separate stroking colors;
 * {@code wrapText} splits a long cell value across multiple lines instead of truncating.
 */
class PdfRepeatingBandBorderParseBackTest {

    private static String pageWith(String element, String formData) {
        return """
            {"templates":[{
              "id":"t1","name":"Band",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }],"_formData":%s}"""
                .formatted(element, formData);
    }

    @Test
    void perEdgeBorders_useDistinctColors() throws IOException {
        String el =
                """
            {"id":"b1","type":"repeatingBand","name":"明細","dataSource":"items","showHeader":true,
             "headerBorderColor":"#cc0000","dataBorderColor":"#00cc00","columnBorderColor":"#0000cc",
             "fields":[{"key":"a","label":"A","width":40},{"key":"b","label":"B","width":40}],
             "position":{"x":15,"y":20},"size":{"width":120,"height":40}}""";
        String data = "{\"items\":[{\"a\":\"x\",\"b\":\"y\"}]}";
        String content = PdfProbe.parse(PdfRenderer.render(pageWith(el, data))).pageContent(0);
        assertTrue(content.contains("0.8 0 0 SC"), "header border #cc0000 missing:\n" + content);
        assertTrue(content.contains("0 0.8 0 SC"), "data border #00cc00 missing");
        assertTrue(content.contains("0 0 0.8 SC"), "column border #0000cc missing");
    }

    @Test
    void wrapText_splitsLongCellIntoMultipleLines() throws IOException {
        String base =
                """
            {"id":"b1","type":"repeatingBand","name":"明細","dataSource":"items","showHeader":false,
             "itemHeight":24%s,
             "fields":[{"key":"a","label":"A","width":30}],
             "position":{"x":15,"y":20},"size":{"width":30,"height":40}}""";
        String data = "{\"items\":[{\"a\":\"あいうえおかきくけこさしすせそたちつてと\"}]}";

        String wrapJson = pageWith(base.formatted(",\"wrapText\":true"), data);
        String noWrapJson = pageWith(base.formatted(""), data);
        int wrapped = PdfProbe.parse(PdfRenderer.render(wrapJson)).runs(0).size();
        int truncated = PdfProbe.parse(PdfRenderer.render(noWrapJson)).runs(0).size();
        assertEquals(1, truncated, "no-wrap should render a single truncated line");
        assertTrue(wrapped >= 2, "wrapText should split into multiple lines, got " + wrapped);
    }
}
