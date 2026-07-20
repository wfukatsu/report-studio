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
 * Renders V2 {@code repeatingList} elements to PDF (issue #53).
 *
 * <p>Lays out one card per data record — vertical, horizontal, or grid ({@code gridColumns}) — each
 * {@code itemWidth}×{@code itemHeight} mm with {@code gap} spacing, bounded by {@code maxItems} and
 * the element frame. Inside each card, {@code fields[]} place text at relative mm coordinates
 * ({@code isLabel} fields render their {@code key} as a static label; others resolve {@code key}
 * from the record). Data resolved upstream into {@code props.data}.
 */
public final class RepeatingListPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;
    private static final Color BORDER = new Color(0xE5, 0xE7, 0xEB);

    @Override
    public String kind() {
        return "repeatingList";
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
        JsonNode rows = arrayData(el);
        List<JsonNode> fields = readFields(el);
        if (rows == null || rows.isEmpty() || fields.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }
        String layout = elementTextOf(el, "layout", "vertical");
        float itemW = elementFloatOf(el, "itemWidth", 40) * MM_TO_PT;
        float itemH = elementFloatOf(el, "itemHeight", 20) * MM_TO_PT;
        float gap = elementFloatOf(el, "gap", 2) * MM_TO_PT;
        int gridCols = Math.max(elementIntOf(el, "gridColumns", 1), 1);
        int maxItems = elementIntOf(el, "maxItems", 0);
        PDFont font = FontProvider.getFont(doc, fontCache);

        int count = rows.size();
        if (maxItems > 0) count = Math.min(count, maxItems);

        cs.saveGraphicsState();
        try {
            for (int i = 0; i < count; i++) {
                // Card origin (top-left) by layout
                float cardX, cardTop;
                switch (layout) {
                    case "horizontal" -> {
                        cardX = x + i * (itemW + gap);
                        cardTop = y;
                    }
                    case "grid" -> {
                        int col = i % gridCols, rowIdx = i / gridCols;
                        cardX = x + col * (itemW + gap);
                        cardTop = y - rowIdx * (itemH + gap);
                    }
                    default -> { // vertical
                        cardX = x;
                        cardTop = y - i * (itemH + gap);
                    }
                }
                // Clip to the element frame
                if (cardTop - itemH < y - h - 0.5f || cardX + itemW > x + w + 0.5f) continue;

                cs.setStrokingColor(BORDER);
                cs.setLineWidth(0.3f);
                cs.addRect(cardX, cardTop - itemH, itemW, itemH);
                cs.stroke();

                JsonNode row = rows.get(i);
                for (JsonNode f : fields) {
                    boolean isLabel = f.path("isLabel").asBoolean(false);
                    String key = textOf(f, "key", "");
                    String text = isLabel ? key : str(row.get(key));
                    if (text.isEmpty()) continue;
                    float fx = cardX + floatOf(f, "x", 0) * MM_TO_PT;
                    float fy = cardTop - floatOf(f, "y", 0) * MM_TO_PT;
                    JsonNode style = f.get("style");
                    float size = style != null ? floatOf(style, "fontSize", 8) : 8;
                    Color color =
                            parseColor(
                                    style != null ? textOf(style, "color", "") : "", Color.BLACK);
                    cs.beginText();
                    cs.setFont(font, size);
                    cs.setNonStrokingColor(color);
                    cs.newLineAtOffset(fx + 1, fy - size);
                    cs.showText(
                            truncateToWidth(text, font, size, floatOf(f, "width", 20) * MM_TO_PT));
                    cs.endText();
                }
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    private static List<JsonNode> readFields(JsonNode el) {
        List<JsonNode> out = new ArrayList<>();
        JsonNode fields = el.get("fields");
        if (fields == null) {
            JsonNode p = el.get("props");
            if (p != null) fields = p.get("fields");
        }
        if (fields != null && fields.isArray()) fields.forEach(out::add);
        return out;
    }

    private static JsonNode arrayData(JsonNode el) {
        JsonNode props = el.get("props");
        if (props != null) {
            JsonNode d = props.get("data");
            if (d != null && d.isArray()) return d;
        }
        return null;
    }

    private static String str(JsonNode n) {
        if (n == null) return "";
        if (n.isNumber()) {
            double d = n.asDouble();
            return (d == Math.rint(d) && Math.abs(d) < 1e15)
                    ? String.valueOf((long) d)
                    : String.valueOf(d);
        }
        return n.asText("");
    }
}
