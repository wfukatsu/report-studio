package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.report.server.ValueFormatter;
import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders V2 {@code repeatingBand} elements to PDF (issue #53) as a self-contained table within the
 * element frame.
 *
 * <p>Unlike the {@code detail_table} section (which flows rows across pages), a repeatingBand
 * element draws its header + data rows inside its own box, bounded by {@code maxItems} — matching
 * the frontend's in-place preview. Column widths come from {@code fields[].width} (mm, normalized
 * to the box), with per-column {@code align} and {@code format}. Data rows are resolved upstream
 * into {@code props.data} (an array).
 *
 * <p>Full parity with the frontend's grouping / subtotals / footer aggregates is out of scope here;
 * this renders the header row and the flat data rows.
 */
public final class RepeatingBandPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_ROW_H = 6f * PdfUnits.MM_TO_PT;
    // Fallbacks mirror the frontend band defaults (src/elements/repeatingBand/bandStyles.ts)
    // so unstyled bands look the same in the designer preview and the PDF (issue #313)
    private static final Color HEADER_BG = new Color(0xF3, 0xF4, 0xF6);
    private static final Color HEADER_TEXT = new Color(0x1A, 0x1A, 0x1A);
    private static final Color BORDER = Color.BLACK;
    private static final float BORDER_W_MM = 0.3f;
    private static final float FONT = 8f;

    @Override
    public String kind() {
        return "repeatingBand";
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
        for (int i = 0; i < cols.size(); i++)
            colX[i + 1] = colX[i] + w * (cols.get(i).width / totalW);

        // Row height follows the element's itemHeight (mm) like the frontend;
        // capacity math in SectionRenderHelper.bandCapacity mirrors this (issue #64)
        float itemHeightMm = elementFloatOf(el, "itemHeight", 6f);
        float rowH = itemHeightMm > 0 ? itemHeightMm * PdfUnits.MM_TO_PT : DEFAULT_ROW_H;
        float headerH =
                elementFloatOf(el, "headerHeight", itemHeightMm) > 0
                        ? elementFloatOf(el, "headerHeight", itemHeightMm) * PdfUnits.MM_TO_PT
                        : rowH;
        int rowCount = rows == null ? 0 : rows.size();
        if (maxItems > 0) rowCount = Math.min(rowCount, maxItems);
        float cursorTop = y;

        // Element style overrides (issue #313) — same resolution as the frontend band:
        // headerStyle drives the header, style drives the data cells, odd/evenRowColor
        // stripe the rows, borderColor/borderWidth drive every grid line.
        JsonNode headerStyle = styleNode(el, "headerStyle");
        JsonNode cellStyle = styleNode(el, "style");
        Color headerBg = parseColor(styleText(headerStyle, "backgroundColor"), HEADER_BG);
        Color headerText = parseColor(styleText(headerStyle, "color"), HEADER_TEXT);
        Color cellText = parseColor(styleText(cellStyle, "color"), Color.BLACK);
        float cellFontSize = cellStyle != null ? floatOf(cellStyle, "fontSize", FONT) : FONT;
        Color oddBg = parseColor(elementTextOf(el, "oddRowColor", ""), null);
        Color evenBg = parseColor(elementTextOf(el, "evenRowColor", ""), null);
        Color border = parseColor(elementTextOf(el, "borderColor", ""), BORDER);
        float borderWmm = elementFloatOf(el, "borderWidth", BORDER_W_MM);
        float borderPt = Math.max(0.1f, borderWmm * PdfUnits.MM_TO_PT);
        PDFont boldFont = FontProvider.getBoldFont(doc, fontCache);

        cs.saveGraphicsState();
        try {
            // Header
            if (showHeader) {
                cs.setNonStrokingColor(headerBg);
                cs.addRect(x, cursorTop - headerH, w, headerH);
                cs.fill();
                for (int i = 0; i < cols.size(); i++) {
                    drawCell(
                            cs,
                            boldFont,
                            FONT,
                            cols.get(i).label,
                            colX[i],
                            colX[i + 1],
                            cursorTop,
                            headerH,
                            "left",
                            headerText);
                }
                cursorTop -= headerH;
            }

            // Data rows
            for (int r = 0; r < rowCount; r++) {
                JsonNode row = rows.get(r);
                // 0.5pt tolerance — exact fits must not be clipped by float drift
                if (cursorTop - rowH < y - h - 0.5f) break; // clip to the box
                // Zebra striping — same parity as the frontend (row 0 = odd row)
                Color rowBg = r % 2 == 0 ? oddBg : evenBg;
                if (rowBg != null) {
                    cs.setNonStrokingColor(rowBg);
                    cs.addRect(x, cursorTop - rowH, w, rowH);
                    cs.fill();
                }
                for (int i = 0; i < cols.size(); i++) {
                    Col c = cols.get(i);
                    String text = ValueFormatter.applyFormat(row.get(c.key), c.format);
                    drawCell(
                            cs,
                            font,
                            cellFontSize,
                            text,
                            colX[i],
                            colX[i + 1],
                            cursorTop,
                            rowH,
                            c.align,
                            cellText);
                }
                // Horizontal row separator (the frontend draws borderBottom on every row)
                cs.setStrokingColor(border);
                cs.setLineWidth(borderPt);
                cs.moveTo(x, cursorTop - rowH);
                cs.lineTo(x + w, cursorTop - rowH);
                cs.stroke();
                cursorTop -= rowH;
            }

            // Grid
            cs.setStrokingColor(border);
            cs.setLineWidth(borderPt);
            float gridBottom = Math.max(cursorTop, y - h);
            cs.addRect(x, gridBottom, w, y - gridBottom);
            cs.stroke();
            if (showHeader) {
                // Header bottom border (frontend hbs)
                cs.moveTo(x, y - headerH);
                cs.lineTo(x + w, y - headerH);
                cs.stroke();
            }
            for (int i = 1; i < cols.size(); i++) {
                cs.moveTo(colX[i], y);
                cs.lineTo(colX[i], gridBottom);
                cs.stroke();
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    /** Read a style object that V2 stores at the element top level and V1 in {@code props}. */
    private static JsonNode styleNode(JsonNode el, String field) {
        JsonNode v = el.get(field);
        if (v != null && v.isObject()) return v;
        JsonNode props = el.get("props");
        JsonNode pv = props != null ? props.get(field) : null;
        return pv != null && pv.isObject() ? pv : null;
    }

    /** Null-safe string read from an optional style node. */
    private static String styleText(JsonNode style, String field) {
        return style != null ? textOf(style, field, "") : "";
    }

    private static void drawCell(
            PDPageContentStream cs,
            PDFont font,
            float fontSize,
            String text,
            float x0,
            float x1,
            float top,
            float rowH,
            String align,
            Color color)
            throws IOException {
        if (text == null || text.isEmpty()) return;
        float cellW = x1 - x0;
        String truncated = truncateToWidth(text, font, fontSize, cellW - 2);
        float tw = font.getStringWidth(truncated) / 1000 * fontSize;
        float tx =
                switch (align) {
                    case "center" -> x0 + (cellW - tw) / 2;
                    case "right" -> x1 - tw - 1;
                    default -> x0 + 1;
                };
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(color);
        cs.newLineAtOffset(tx, top - rowH / 2 - fontSize * 0.35f);
        cs.showText(truncated);
        cs.endText();
    }

    private record Col(String key, String label, float width, String align, JsonNode format) {}

    private static List<Col> readColumns(JsonNode el) {
        List<Col> cols = new ArrayList<>();
        JsonNode fields = el.get("fields");
        if (fields == null) {
            JsonNode p = el.get("props");
            if (p != null) fields = p.get("fields");
        }
        if (fields == null || !fields.isArray()) return cols;
        for (JsonNode f : fields) {
            cols.add(
                    new Col(
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
