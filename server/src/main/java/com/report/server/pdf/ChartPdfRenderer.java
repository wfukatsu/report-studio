package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders V2 {@code chart} elements to PDF natively with PDFBox (issue #53).
 *
 * <p>Supports bar / line / pie / donut using the frontend's default palette. Data is resolved from
 * {@code _formData[dataBinding]} (an array of objects); {@code xAxisKey} labels the category axis
 * and {@code yAxisKeys} select the numeric series ({@code ['value']} by default). This is a static
 * chart — no animation, no interactivity — matching the exported (non-interactive) appearance of
 * the Recharts preview.
 *
 * <p>Recharts parity (#369): dashed Y gridlines + Y-axis tick labels ({@code showGrid}, default
 * on), a bottom legend ({@code showLegend}, default on), monotone-smoothed line series, and
 * pie-slice labels.
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
    private static final Color GRID = new Color(0xCC, 0xCC, 0xCC);
    private static final Color LABEL = Color.GRAY;
    private static final int Y_TICKS = 5;

    @Override
    public String kind() {
        return "chart";
    }

    @Override
    public void render(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            float pageHeight,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        String chartType = elementTextOf(el, "chartType", "bar");
        String xKey = elementTextOf(el, "xAxisKey", "name");
        List<String> yKeys = readYKeys(el);
        List<Color> colors = readColors(el);
        JsonNode rows = readData(el);
        boolean showLegend = elementBoolOf(el, "showLegend", true);
        boolean showGrid = elementBoolOf(el, "showGrid", true);
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

            float legendH = showLegend ? 5f * MM_TO_PT : 0f;
            float plotBottomWithLegend = bottom + legendH;

            switch (chartType) {
                case "pie", "donut" -> {
                    renderPie(
                            cs,
                            font,
                            rows,
                            xKey,
                            yKeys.get(0),
                            colors,
                            left,
                            right,
                            chartTop,
                            plotBottomWithLegend,
                            "donut".equals(chartType));
                    if (showLegend) {
                        drawLegend(
                                cs, font, categoryNames(rows, xKey), colors, left, right, bottom);
                    }
                }
                case "line" -> {
                    renderXYChart(
                            cs,
                            font,
                            rows,
                            xKey,
                            yKeys,
                            colors,
                            left,
                            right,
                            chartTop,
                            plotBottomWithLegend,
                            showGrid,
                            true);
                    if (showLegend) {
                        drawLegend(cs, font, yKeys, colors, left, right, bottom);
                    }
                }
                default -> {
                    renderXYChart(
                            cs,
                            font,
                            rows,
                            xKey,
                            yKeys,
                            colors,
                            left,
                            right,
                            chartTop,
                            plotBottomWithLegend,
                            showGrid,
                            false);
                    if (showLegend) {
                        drawLegend(cs, font, yKeys, colors, left, right, bottom);
                    }
                }
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    // ── Bar / Line (shared plot area) ───────────────────────────────────

    private void renderXYChart(
            PDPageContentStream cs,
            PDFont font,
            JsonNode rows,
            String xKey,
            List<String> yKeys,
            List<Color> colors,
            float left,
            float right,
            float top,
            float bottom,
            boolean showGrid,
            boolean line)
            throws IOException {
        float yAxisW = 9f * MM_TO_PT; // room for Y tick labels
        float xAxisH = 4f * MM_TO_PT; // room for X category labels
        float plotLeft = left + yAxisW;
        float plotRight = right - 1f * MM_TO_PT;
        float plotBottom = bottom + xAxisH;
        float plotTop = top;

        double niceMax = niceMax(maxValue(rows, yKeys));

        // Grid + Y-axis tick labels (#369)
        if (showGrid) {
            drawGridAndYTicks(cs, font, plotLeft, plotRight, plotBottom, plotTop, niceMax);
        }
        drawAxes(cs, plotLeft, plotRight, plotBottom, plotTop);

        int n = rows.size();
        float plotH = plotTop - plotBottom;
        if (line) {
            float step = n > 1 ? (plotRight - plotLeft) / (n - 1) : 0;
            for (int s = 0; s < yKeys.size(); s++) {
                cs.setStrokingColor(colors.get(s % colors.size()));
                cs.setLineWidth(1f);
                List<float[]> pts = new ArrayList<>(n);
                for (int i = 0; i < n; i++) {
                    double v = num(rows.get(i).get(yKeys.get(s)));
                    float px = plotLeft + step * i;
                    float py = plotBottom + (niceMax > 0 ? (float) (v / niceMax) * plotH : 0);
                    pts.add(new float[] {px, py});
                }
                strokeSmooth(cs, pts); // monotone-style smoothing (Recharts default)
            }
        } else {
            int series = yKeys.size();
            float groupW = (plotRight - plotLeft) / n;
            float barW = groupW * 0.7f / series;
            for (int i = 0; i < n; i++) {
                float gx = plotLeft + groupW * i + groupW * 0.15f;
                for (int s = 0; s < series; s++) {
                    double v = num(rows.get(i).get(yKeys.get(s)));
                    float bh = niceMax > 0 ? (float) (v / niceMax) * plotH : 0;
                    cs.setNonStrokingColor(colors.get(s % colors.size()));
                    cs.addRect(gx + barW * s, plotBottom, barW, bh);
                    cs.fill();
                }
            }
        }

        // X category labels
        for (int i = 0; i < n; i++) {
            float cx =
                    line
                            ? plotLeft + (n > 1 ? (plotRight - plotLeft) / (n - 1) : 0) * i
                            : plotLeft + ((plotRight - plotLeft) / n) * (i + 0.5f);
            drawCenteredLabel(cs, font, str(rows.get(i).get(xKey)), cx, plotBottom - 3f);
        }
    }

    // ── Pie / donut ─────────────────────────────────────────────────────

    private void renderPie(
            PDPageContentStream cs,
            PDFont font,
            JsonNode rows,
            String xKey,
            String valueKey,
            List<Color> colors,
            float left,
            float right,
            float top,
            float bottom,
            boolean donut)
            throws IOException {
        float cx = (left + right) / 2, cy = (top + bottom) / 2;
        float r = Math.min(right - left, top - bottom) / 2 * 0.8f;
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
        } else {
            // Pie-slice labels (#369): category name at each slice's mid-angle, just outside r
            double mid = 90;
            for (int i = 0; i < rows.size(); i++) {
                double frac = Math.max(0, num(rows.get(i).get(valueKey))) / total;
                double sweep = frac * 360;
                double a = Math.toRadians(mid - sweep / 2);
                float lx = cx + (float) Math.cos(a) * (r + 2f);
                float ly = cy + (float) Math.sin(a) * (r + 2f);
                drawCenteredLabel(cs, font, str(rows.get(i).get(xKey)), lx, ly);
                mid -= sweep;
            }
        }
    }

    // ── Drawing helpers ─────────────────────────────────────────────────

    private static void drawAxes(
            PDPageContentStream cs, float left, float right, float bottom, float top)
            throws IOException {
        cs.setStrokingColor(AXIS);
        cs.setLineWidth(0.5f);
        cs.moveTo(left, top);
        cs.lineTo(left, bottom);
        cs.lineTo(right, bottom);
        cs.stroke();
    }

    /** Dashed horizontal gridlines and left-side numeric tick labels (Recharts CartesianGrid). */
    private static void drawGridAndYTicks(
            PDPageContentStream cs,
            PDFont font,
            float left,
            float right,
            float bottom,
            float top,
            double niceMax)
            throws IOException {
        float labelSize = 2f * MM_TO_PT;
        for (int t = 0; t <= Y_TICKS; t++) {
            float gy = bottom + (top - bottom) * t / Y_TICKS;
            cs.setStrokingColor(GRID);
            cs.setLineWidth(0.3f);
            cs.setLineDashPattern(new float[] {2f, 2f}, 0);
            cs.moveTo(left, gy);
            cs.lineTo(right, gy);
            cs.stroke();
            cs.setLineDashPattern(new float[] {}, 0); // reset to solid

            String label = formatTick(niceMax * t / Y_TICKS);
            float tw = font.getStringWidth(label) / 1000 * labelSize;
            cs.beginText();
            cs.setFont(font, labelSize);
            cs.setNonStrokingColor(LABEL);
            cs.newLineAtOffset(left - tw - 1.5f, gy - labelSize * 0.35f);
            cs.showText(label);
            cs.endText();
        }
    }

    /** Bottom legend row: colored swatch + name per series/category, centred (Recharts default). */
    private static void drawLegend(
            PDPageContentStream cs,
            PDFont font,
            List<String> names,
            List<Color> colors,
            float left,
            float right,
            float bottom)
            throws IOException {
        float size = 2f * MM_TO_PT;
        float sw = 2f * MM_TO_PT; // swatch
        float gap = 1f * MM_TO_PT;
        float itemGap = 3f * MM_TO_PT;
        float total = 0;
        for (String name : names) {
            total += sw + gap + font.getStringWidth(name) / 1000 * size + itemGap;
        }
        float cursorX = Math.max(left, (left + right) / 2 - total / 2);
        float rowY = bottom + 1f * MM_TO_PT;
        for (int i = 0; i < names.size(); i++) {
            cs.setNonStrokingColor(colors.get(i % colors.size()));
            cs.addRect(cursorX, rowY, sw, sw);
            cs.fill();
            cursorX += sw + gap;
            cs.beginText();
            cs.setFont(font, size);
            cs.setNonStrokingColor(Color.DARK_GRAY);
            cs.newLineAtOffset(cursorX, rowY);
            cs.showText(names.get(i));
            cs.endText();
            cursorX += font.getStringWidth(names.get(i)) / 1000 * size + itemGap;
        }
    }

    private static void drawCenteredLabel(
            PDPageContentStream cs, PDFont font, String text, float centerX, float baselineY)
            throws IOException {
        if (text.isEmpty()) return;
        float size = 2f * MM_TO_PT;
        float tw = font.getStringWidth(text) / 1000 * size;
        cs.beginText();
        cs.setFont(font, size);
        cs.setNonStrokingColor(LABEL);
        cs.newLineAtOffset(centerX - tw / 2, baselineY - size);
        cs.showText(text);
        cs.endText();
    }

    private static void renderEmpty(
            PDPageContentStream cs, PDFont font, float left, float right, float top, float bottom)
            throws IOException {
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

    /**
     * Stroke a smooth curve through {@code pts} using Catmull-Rom → Bézier (monotone-ish, #369).
     */
    private static void strokeSmooth(PDPageContentStream cs, List<float[]> pts) throws IOException {
        int n = pts.size();
        if (n == 0) return;
        cs.moveTo(pts.get(0)[0], pts.get(0)[1]);
        if (n == 1) {
            cs.stroke();
            return;
        }
        for (int i = 0; i < n - 1; i++) {
            float[] p0 = pts.get(Math.max(0, i - 1));
            float[] p1 = pts.get(i);
            float[] p2 = pts.get(i + 1);
            float[] p3 = pts.get(Math.min(n - 1, i + 2));
            float c1x = p1[0] + (p2[0] - p0[0]) / 6f;
            float c1y = p1[1] + (p2[1] - p0[1]) / 6f;
            float c2x = p2[0] - (p3[0] - p1[0]) / 6f;
            float c2y = p2[1] - (p3[1] - p1[1]) / 6f;
            cs.curveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
        }
        cs.stroke();
    }

    /** Fill a pie sector from angle a1 to a2 (degrees) with a fan of line segments. */
    private static void fillSector(
            PDPageContentStream cs, float cx, float cy, float r, double a1, double a2)
            throws IOException {
        cs.moveTo(cx, cy);
        int steps = Math.max(2, (int) Math.ceil(Math.abs(a1 - a2) / 6));
        for (int i = 0; i <= steps; i++) {
            double a = Math.toRadians(a1 + (a2 - a1) * i / steps);
            cs.lineTo(cx + (float) Math.cos(a) * r, cy + (float) Math.sin(a) * r);
        }
        cs.closePath();
        cs.fill();
    }

    private static void fillCircle(PDPageContentStream cs, float cx, float cy, float r)
            throws IOException {
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

    private static List<String> categoryNames(JsonNode rows, String xKey) {
        List<String> names = new ArrayList<>();
        for (JsonNode row : rows) names.add(str(row.get(xKey)));
        return names;
    }

    /** Round a raw maximum up to a "nice" axis ceiling (1/2/5 × 10^k). */
    private static double niceMax(double raw) {
        if (raw <= 0) return 1;
        double exp = Math.floor(Math.log10(raw));
        double base = Math.pow(10, exp);
        double f = raw / base;
        double nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
        return nf * base;
    }

    private static String formatTick(double v) {
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return String.valueOf((long) v);
        return String.valueOf(Math.round(v * 100) / 100.0);
    }

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
        if (y == null) {
            JsonNode p = el.get("props");
            if (p != null) y = p.get("yAxisKeys");
        }
        if (y != null && y.isArray()) y.forEach(n -> keys.add(n.asText()));
        if (keys.isEmpty()) keys.add("value");
        return keys;
    }

    private static List<Color> readColors(JsonNode el) {
        List<Color> colors = new ArrayList<>();
        JsonNode c = el.get("colors");
        if (c == null) {
            JsonNode p = el.get("props");
            if (p != null) c = p.get("colors");
        }
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
        try {
            return Double.parseDouble(n.asText().trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static String str(JsonNode n) {
        return n == null ? "" : n.asText("");
    }
}
