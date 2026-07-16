package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.report.server.ValueFormatter;
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
 * Renders V2 {@code repeatingBand} elements to PDF (issue #53) as a
 * self-contained table within the element frame.
 *
 * <p>Unlike the {@code detail_table} section (which flows rows across pages),
 * a repeatingBand element draws its header + data rows inside its own box,
 * bounded by {@code maxItems} — matching the frontend's in-place preview.
 * Column widths come from {@code fields[].width} (mm, normalized to the box),
 * with per-column {@code align} and {@code format}. Data rows are resolved
 * upstream into {@code props.data} (an array).
 *
 * <p>Full parity with the frontend's grouping / subtotals / footer aggregates
 * is out of scope here; this renders the header row and the flat data rows.
 */
public final class RepeatingBandPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_ROW_H = 6f * PdfUnits.MM_TO_PT;
    private static final Color HEADER_BG = new Color(0xF1, 0xF5, 0xF9);
    private static final Color BORDER = new Color(0xCB, 0xD5, 0xE1);
    private static final float FONT = 8f;

    @Override
    public String kind() {
        return "repeatingBand";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        List<Col> cols = readColumns(el);
        if (cols.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }
        JsonNode rows = arrayData(el);
        boolean showHeader = elementBoolOf(el, "showHeader", true);
        int maxItems = elementIntOf(el, "maxItems", 0);
        PDFont font = FontProvider.getFont(doc, fontCache);

        // Normalize column widths to the box
        float totalW = 0;
        for (Col c : cols) totalW += c.width;
        if (totalW <= 0) totalW = cols.size();
        float[] colX = new float[cols.size() + 1];
        colX[0] = x;
        for (int i = 0; i < cols.size(); i++) colX[i + 1] = colX[i] + w * (cols.get(i).width / totalW);

        // Row height follows the element's itemHeight (mm) like the frontend;
        // capacity math in SectionRenderHelper.bandCapacity mirrors this (issue #64)
        float itemHeightMm = elementFloatOf(el, "itemHeight", 6f);
        float rowH = itemHeightMm > 0 ? itemHeightMm * PdfUnits.MM_TO_PT : DEFAULT_ROW_H;
        float headerH = elementFloatOf(el, "headerHeight", itemHeightMm) > 0
                ? elementFloatOf(el, "headerHeight", itemHeightMm) * PdfUnits.MM_TO_PT : rowH;
        int rowCount = rows == null ? 0 : rows.size();
        if (maxItems > 0) rowCount = Math.min(rowCount, maxItems);
        float cursorTop = y;

        cs.saveGraphicsState();
        try {
            // Header
            if (showHeader) {
                cs.setNonStrokingColor(HEADER_BG);
                cs.addRect(x, cursorTop - headerH, w, headerH);
                cs.fill();
                for (int i = 0; i < cols.size(); i++) {
                    drawCell(cs, font, cols.get(i).label, colX[i], colX[i + 1],
                            cursorTop, headerH, "left", true, Color.BLACK);
                }
                cursorTop -= headerH;
            }

            // Data rows
            for (int r = 0; r < rowCount; r++) {
                JsonNode row = rows.get(r);
                // 0.5pt tolerance — exact fits must not be clipped by float drift
                if (cursorTop - rowH < y - h - 0.5f) break; // clip to the box
                for (int i = 0; i < cols.size(); i++) {
                    Col c = cols.get(i);
                    String text = ValueFormatter.applyFormat(row.get(c.key), c.format);
                    drawCell(cs, font, text, colX[i], colX[i + 1], cursorTop, rowH,
                            c.align, false, Color.BLACK);
                }
                cursorTop -= rowH;
            }

            // Grid
            cs.setStrokingColor(BORDER);
            cs.setLineWidth(0.4f);
            float gridBottom = Math.max(cursorTop, y - h);
            cs.addRect(x, gridBottom, w, y - gridBottom);
            cs.stroke();
            for (int i = 1; i < cols.size(); i++) {
                cs.moveTo(colX[i], y);
                cs.lineTo(colX[i], gridBottom);
                cs.stroke();
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    private static void drawCell(PDPageContentStream cs, PDFont font, String text,
                                 float x0, float x1, float top, float rowH,
                                 String align, boolean bold, Color color) throws IOException {
        if (text == null || text.isEmpty()) return;
        float cellW = x1 - x0;
        String truncated = truncateToWidth(text, font, FONT, cellW - 2);
        float tw = font.getStringWidth(truncated) / 1000 * FONT;
        float tx = switch (align) {
            case "center" -> x0 + (cellW - tw) / 2;
            case "right" -> x1 - tw - 1;
            default -> x0 + 1;
        };
        cs.beginText();
        cs.setFont(font, FONT);
        cs.setNonStrokingColor(color);
        cs.newLineAtOffset(tx, top - rowH / 2 - FONT * 0.35f);
        cs.showText(truncated);
        cs.endText();
    }

    private record Col(String key, String label, float width, String align, JsonNode format) {}

    private static List<Col> readColumns(JsonNode el) {
        List<Col> cols = new ArrayList<>();
        JsonNode fields = el.get("fields");
        if (fields == null) { JsonNode p = el.get("props"); if (p != null) fields = p.get("fields"); }
        if (fields == null || !fields.isArray()) return cols;
        for (JsonNode f : fields) {
            cols.add(new Col(
                    textOf(f, "key", ""),
                    textOf(f, "label", textOf(f, "key", "")),
                    floatOf(f, "width", 20f),
                    textOf(f, "align", "left"),
                    f.get("format")));
        }
        return cols;
    }

    private static JsonNode arrayData(JsonNode el) {
        JsonNode props = el.get("props");
        if (props != null) {
            JsonNode d = props.get("data");
            if (d != null && d.isArray()) return d;
        }
        return null;
    }
}
