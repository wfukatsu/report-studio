package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;

/**
 * Shared utilities for PDF element renderers.
 */
public final class PdfUtils {

    private PdfUtils() {}

    public static String textOf(JsonNode node, String field, String defaultValue) {
        JsonNode v = node.get(field);
        return v != null && v.isTextual() ? v.asText() : defaultValue;
    }

    public static float floatOf(JsonNode node, String field) {
        return floatOf(node, field, 0);
    }

    public static float floatOf(JsonNode node, String field, float defaultValue) {
        JsonNode v = node.get(field);
        return v != null && v.isNumber() ? v.floatValue() : defaultValue;
    }

    public static int intOf(JsonNode node, String field, int defaultValue) {
        JsonNode v = node.get(field);
        return v != null && v.isNumber() ? v.intValue() : defaultValue;
    }

    public static boolean boolOf(JsonNode node, String field, boolean defaultValue) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asBoolean(defaultValue) : defaultValue;
    }

    /**
     * Truncate text to fit within maxWidth. O(n) single-pass accumulation
     * instead of O(n log n) binary search with repeated substring scans.
     */
    public static String truncateToWidth(String text, PDFont font, float fontSize, float maxWidth) {
        float scale = fontSize / 1000f;
        float accumulated = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            try {
                accumulated += font.getWidth(cp) * scale;
            } catch (IOException e) {
                return text.substring(0, i);
            }
            if (accumulated > maxWidth) {
                return i > 0 ? text.substring(0, i) : "";
            }
            i += Character.charCount(cp);
        }
        return text;
    }

    /**
     * Draw a uniform grid. All lines are batched into a single stroke() call.
     * Draws both outer border and inner dividers.
     *
     * @param cs        content stream
     * @param x         left edge (PDF points)
     * @param y         top edge (PDF points, PDF coordinate space)
     * @param w         total width
     * @param h         total height
     * @param cols      number of columns
     * @param rows      number of rows
     * @param lineWidth stroke width
     * @param lineColor stroke color
     */
    public static void drawGrid(PDPageContentStream cs, float x, float y,
                                float w, float h, int cols, int rows,
                                float lineWidth, Color lineColor) throws IOException {
        float colW = w / cols;
        float rowH = h / rows;

        cs.setStrokingColor(lineColor);
        cs.setLineWidth(lineWidth);

        // Horizontal lines (top to bottom, including top and bottom edges)
        for (int r = 0; r <= rows; r++) {
            float lineY = y - r * rowH;
            cs.moveTo(x, lineY);
            cs.lineTo(x + w, lineY);
        }

        // Vertical lines (left to right, including left and right edges)
        for (int c = 0; c <= cols; c++) {
            float lineX = x + c * colW;
            cs.moveTo(lineX, y);
            cs.lineTo(lineX, y - h);
        }

        cs.stroke(); // single stroke for all lines
    }

    /** Render a light-gray border rectangle (fallback for unsupported kinds). */
    public static void renderBorder(PDPageContentStream cs, float x, float y, float w, float h) throws IOException {
        cs.setStrokingColor(Color.LIGHT_GRAY);
        cs.setLineWidth(0.5f);
        cs.addRect(x, y - h, w, h);
        cs.stroke();
    }
}
