package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders V2 {@code chart} elements to PDF natively with PDFBox (issue #53).
 *
 * <p>Supports bar / line / pie / donut using the frontend's default palette.
 * Data is resolved from {@code _formData[dataBinding]} (an array of objects);
 * {@code xAxisKey} labels the category axis and {@code yAxisKeys} select the
 * numeric series ({@code ['value']} by default). This is a static chart —
 * no animation, no interactivity — matching the exported (non-interactive)
 * appearance of the Recharts preview.
 */
public final class ChartPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;

    /** Mirror of DEFAULT_CHART_COLORS (src/elements/_blocks/constants.ts). */
    private static final Color[] PALETTE = {
            new Color(0x88, 0x84, 0xd8),
            new Color(0x82, 0xca, 0x9d),
            new Color(0xff, 0xc6, 0x58),
            new Color(0xff, 0x73, 0x00),
            new Color(0xa4, 0xde, 0x6c),
    };
    private static final Color AXIS = new Color(0x99, 0x99, 0x99);

    @Override
    public String kind() {
        return "chart";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        String chartType = elementTextOf(el, "chartType", "bar");
        String xKey = elementTextOf(el, "xAxisKey", "name");
        List<String> yKeys = readYKeys(el);
        List<Color> colors = readColors(el);
        JsonNode rows = readData(el);
        PDFont font = FontProvider.getFont(doc, fontCache);

        float top = y, bottom = y - h, left = x, right = x + w;

        cs.saveGraphicsState();
        try {
            // Optional title
            String title = elementTextOf(el, "title", "");
            float chartTop = top;
            if (!title.isEmpty()) {
                float ts = 3f * MM_TO_PT;
                cs.beginText();
                cs.setFont(font, ts);
                cs.setNonStrokingColor(Color.DARK_GRAY);
                cs.newLineAtOffset(left, top - ts);
                cs.showText(title);
                cs.endText();
                chartTop = top - ts * 1.6f;
            }

            if (rows == null || rows.isEmpty() || yKeys.isEmpty()) {
                renderEmpty(cs, font, left, right, chartTop, bottom);
                return;
            }

            switch (chartType) {
                case "pie", "donut" -> renderPie(cs, rows, yKeys.get(0), colors,
                        left, right, chartTop, bottom, "donut".equals(chartType));
                case "line" -> renderLine(cs, rows, xKey, yKeys, colors, font,
                        left, right, chartTop, bottom);
                default -> renderBar(cs, rows, xKey, yKeys, colors, font,
                        left, right, chartTop, bottom);
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    // ── Bar ─────────────────────────────────────────────────────────────

    private void renderBar(PDPageContentStream cs, JsonNode rows, String xKey, List<String> yKeys,
                           List<Color> colors, PDFont font, float left, float right,
                           float top, float bottom) throws IOException {
        float plotLeft = left + 6 * MM_TO_PT;
        float plotBottom = bottom + 5 * MM_TO_PT;
        double max = maxValue(rows, yKeys);
        drawAxes(cs, plotLeft, right, plotBottom, top);

        int n = rows.size();
        int series = yKeys.size();
        float groupW = (right - plotLeft) / n;
        float barW = groupW * 0.7f / series;
        for (int i = 0; i < n; i++) {
            JsonNode row = rows.get(i);
            float gx = plotLeft + groupW * i + groupW * 0.15f;
            for (int s = 0; s < series; s++) {
                double v = num(row.get(yKeys.get(s)));
                float bh = max > 0 ? (float) (v / max) * (top - plotBottom) : 0;
                cs.setNonStrokingColor(colors.get(s % colors.size()));
                cs.addRect(gx + barW * s, plotBottom, barW, bh);
                cs.fill();
            }
            drawAxisLabel(cs, font, str(row.get(xKey)), gx + groupW * 0.35f, plotBottom - 3f);
        }
    }

    // ── Line ────────────────────────────────────────────────────────────

    private void renderLine(PDPageContentStream cs, JsonNode rows, String xKey, List<String> yKeys,
                            List<Color> colors, PDFont font, float left, float right,
                            float top, float bottom) throws IOException {
        float plotLeft = left + 6 * MM_TO_PT;
        float plotBottom = bottom + 5 * MM_TO_PT;
        double max = maxValue(rows, yKeys);
        drawAxes(cs, plotLeft, right, plotBottom, top);

        int n = rows.size();
        float step = n > 1 ? (right - plotLeft) / (n - 1) : 0;
        cs.setLineWidth(1f);
        for (int s = 0; s < yKeys.size(); s++) {
            cs.setStrokingColor(colors.get(s % colors.size()));
            for (int i = 0; i < n; i++) {
                double v = num(rows.get(i).get(yKeys.get(s)));
                float px = plotLeft + step * i;
                float py = plotBottom + (max > 0 ? (float) (v / max) * (top - plotBottom) : 0);
                if (i == 0) cs.moveTo(px, py);
                else cs.lineTo(px, py);
            }
            cs.stroke();
        }
        for (int i = 0; i < n; i++) {
            drawAxisLabel(cs, font, str(rows.get(i).get(xKey)), plotLeft + step * i, plotBottom - 3f);
        }
    }

    // ── Pie / donut ─────────────────────────────────────────────────────

    private void renderPie(PDPageContentStream cs, JsonNode rows, String valueKey, List<Color> colors,
                           float left, float right, float top, float bottom, boolean donut) throws IOException {
        float cx = (left + right) / 2, cy = (top + bottom) / 2;
        float r = Math.min(right - left, top - bottom) / 2 * 0.9f;
        double total = 0;
        for (JsonNode row : rows) total += Math.max(0, num(row.get(valueKey)));
        if (total <= 0) return;

        double start = 90; // start at 12 o'clock, clockwise
        for (int i = 0; i < rows.size(); i++) {
            double frac = Math.max(0, num(rows.get(i).get(valueKey))) / total;
            double sweep = frac * 360;
            cs.setNonStrokingColor(colors.get(i % colors.size()));
            fillSector(cs, cx, cy, r, start, start - sweep);
            start -= sweep;
        }
        if (donut) {
            cs.setNonStrokingColor(Color.WHITE);
            fillCircle(cs, cx, cy, r * 0.55f);
        }
    }

    // ── Drawing helpers ─────────────────────────────────────────────────

    private static void drawAxes(PDPageContentStream cs, float left, float right,
                                 float bottom, float top) throws IOException {
        cs.setStrokingColor(AXIS);
        cs.setLineWidth(0.5f);
        cs.moveTo(left, top);
        cs.lineTo(left, bottom);
        cs.lineTo(right, bottom);
        cs.stroke();
    }

    private static void drawAxisLabel(PDPageContentStream cs, PDFont font, String text,
                                      float centerX, float baselineY) throws IOException {
        if (text.isEmpty()) return;
        float size = 2f * MM_TO_PT;
        float tw = font.getStringWidth(text) / 1000 * size;
        cs.beginText();
        cs.setFont(font, size);
        cs.setNonStrokingColor(Color.GRAY);
        cs.newLineAtOffset(centerX - tw / 2, baselineY - size);
        cs.showText(text);
        cs.endText();
    }

    private static void renderEmpty(PDPageContentStream cs, PDFont font, float left, float right,
                                    float top, float bottom) throws IOException {
        cs.setStrokingColor(new Color(0xD1, 0xD5, 0xDB));
        cs.setLineWidth(0.5f);
        cs.addRect(left, bottom, right - left, top - bottom);
        cs.stroke();
        String msg = "データなし";
        float size = 2.5f * MM_TO_PT;
        float tw = font.getStringWidth(msg) / 1000 * size;
        cs.beginText();
        cs.setFont(font, size);
        cs.setNonStrokingColor(new Color(0x9C, 0xA3, 0xAF));
        cs.newLineAtOffset((left + right) / 2 - tw / 2, (top + bottom) / 2);
        cs.showText(msg);
        cs.endText();
    }

    /** Fill a pie sector from angle a1 to a2 (degrees) with a fan of bezier-free line segments. */
    private static void fillSector(PDPageContentStream cs, float cx, float cy, float r,
                                   double a1, double a2) throws IOException {
        cs.moveTo(cx, cy);
        int steps = Math.max(2, (int) Math.ceil(Math.abs(a1 - a2) / 6));
        for (int i = 0; i <= steps; i++) {
            double a = Math.toRadians(a1 + (a2 - a1) * i / steps);
            cs.lineTo(cx + (float) Math.cos(a) * r, cy + (float) Math.sin(a) * r);
        }
        cs.closePath();
        cs.fill();
    }

    private static void fillCircle(PDPageContentStream cs, float cx, float cy, float r) throws IOException {
        float k = 0.5522848f * r;
        cs.moveTo(cx - r, cy);
        cs.curveTo(cx - r, cy + k, cx - k, cy + r, cx, cy + r);
        cs.curveTo(cx + k, cy + r, cx + r, cy + k, cx + r, cy);
        cs.curveTo(cx + r, cy - k, cx + k, cy - r, cx, cy - r);
        cs.curveTo(cx - k, cy - r, cx - r, cy - k, cx - r, cy);
        cs.closePath();
        cs.fill();
    }

    // ── Data helpers ────────────────────────────────────────────────────

    private static JsonNode readData(JsonNode el) {
        // Resolved upstream: _formData[dataBinding] copied into props.data
        JsonNode props = el.get("props");
        if (props != null) {
            JsonNode d = props.get("data");
            if (d != null && d.isArray()) return d;
        }
        JsonNode inline = el.get("data");
        return inline != null && inline.isArray() ? inline : null;
    }

    private static List<String> readYKeys(JsonNode el) {
        List<String> keys = new ArrayList<>();
        JsonNode y = el.get("yAxisKeys");
        if (y == null) { JsonNode p = el.get("props"); if (p != null) y = p.get("yAxisKeys"); }
        if (y != null && y.isArray()) y.forEach(n -> keys.add(n.asText()));
        if (keys.isEmpty()) keys.add("value");
        return keys;
    }

    private static List<Color> readColors(JsonNode el) {
        List<Color> colors = new ArrayList<>();
        JsonNode c = el.get("colors");
        if (c == null) { JsonNode p = el.get("props"); if (p != null) c = p.get("colors"); }
        if (c != null && c.isArray()) {
            c.forEach(n -> colors.add(parseColor(n.asText(""), PALETTE[0])));
        }
        if (colors.isEmpty()) for (Color col : PALETTE) colors.add(col);
        return colors;
    }

    private static double maxValue(JsonNode rows, List<String> yKeys) {
        double max = 0;
        for (JsonNode row : rows) {
            for (String k : yKeys) max = Math.max(max, num(row.get(k)));
        }
        return max;
    }

    private static double num(JsonNode n) {
        if (n == null) return 0;
        if (n.isNumber()) return n.asDouble();
        try { return Double.parseDouble(n.asText().trim()); } catch (Exception e) { return 0; }
    }

    private static String str(JsonNode n) {
        return n == null ? "" : n.asText("");
    }
}
