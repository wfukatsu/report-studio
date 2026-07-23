package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for chart Recharts parity (#369): dashed gridlines + Y-axis tick labels, a
 * bottom legend, monotone line smoothing, and pie-slice labels.
 */
class PdfChartFeaturesParseBackTest {

    private static final String BARS =
            "{\"d\":[{\"month\":\"1月\",\"amount\":200},{\"month\":\"2月\",\"amount\":100}]}";

    private static String json(String extra, String data) {
        String el =
                """
            {"id":"c1","type":"chart","name":"グラフ","dataBinding":"d",
             "xAxisKey":"month","yAxisKeys":["amount"]%s,
             "position":{"x":15,"y":20},"size":{"width":150,"height":90}}"""
                        .formatted(extra);
        return """
            {"templates":[{
              "id":"t1","name":"Chart",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }],"_formData":%s}"""
                .formatted(el, data);
    }

    private static PdfProbe render(String extra, String data) throws IOException {
        return PdfProbe.parse(PdfRenderer.render(json(extra, data)));
    }

    @Test
    void grid_drawsDashedLinesAndYTickLabels() throws IOException {
        PdfProbe probe = render(",\"chartType\":\"bar\",\"showGrid\":true", BARS);
        assertTrue(probe.pageContent(0).contains("[2 2 ] 0 d"), "gridlines should be dashed");
        // niceMax(200) = 200 → a "200" Y-axis tick label
        assertTrue(probe.pageContains(0, "200"), "Y tick labels missing: " + probe.pageText(0));
    }

    @Test
    void grid_canBeDisabled() throws IOException {
        String content = render(",\"chartType\":\"bar\",\"showGrid\":false", BARS).pageContent(0);
        assertFalse(content.contains("[2 2 ] 0 d"), "showGrid:false should not draw gridlines");
    }

    @Test
    void legend_showsSeriesNames() throws IOException {
        PdfProbe probe = render(",\"chartType\":\"bar\",\"showLegend\":true", BARS);
        assertTrue(probe.pageContains(0, "amount"), "legend name missing: " + probe.pageText(0));
    }

    @Test
    void line_isSmoothed() throws IOException {
        // monotone smoothing draws Bézier curves → 'c' operators (a straight polyline uses 'l')
        String content = render(",\"chartType\":\"line\"", BARS).pageContent(0);
        assertTrue(
                content.lines().anyMatch(l -> l.trim().endsWith(" c")),
                "smoothed line should emit curve operators");
    }

    @Test
    void pie_drawsSliceLabels() throws IOException {
        String pieData =
                "{\"d\":[{\"month\":\"りんご\",\"amount\":30},{\"month\":\"みかん\",\"amount\":70}]}";
        PdfProbe probe = render(",\"chartType\":\"pie\",\"yAxisKeys\":[\"amount\"]", pieData);
        assertTrue(probe.pageContains(0, "りんご"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "みかん"), probe.pageText(0));
    }
}
