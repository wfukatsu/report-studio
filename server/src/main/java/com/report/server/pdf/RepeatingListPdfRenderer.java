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
        PDFont boldFont = FontProvider.getBoldFont(doc, fontCache);

        // Card styling (#370), mirroring the frontend RepeatingList card:
        //   background = itemBackground ?? #ffffff; border drawn only when borderColor is set
        //   (width default 0.3mm); borderRadius rounds the corners.
        Color itemBg = parseColor(elementTextOf(el, "itemBackground", ""), Color.WHITE);
        String borderColorStr = elementTextOf(el, "borderColor", "");
        boolean hasBorder = !borderColorStr.isEmpty();
        Color borderColor = parseColor(borderColorStr, BORDER);
        float borderPt = Math.max(0.1f, elementFloatOf(el, "borderWidth", 0.3f) * MM_TO_PT);
        float radiusPt = elementFloatOf(el, "borderRadius", 0) * MM_TO_PT;
        Color defaultFieldColor = new Color(0x37, 0x41, 0x51); // frontend default text color

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

                float bx = cardX;
                float by = cardTop - itemH;
                // Card background (front default #ffffff)
                cs.setNonStrokingColor(itemBg);
                cardPath(cs, bx, by, itemW, itemH, radiusPt);
                cs.fill();
                // Card border — only when borderColor is set (frontend borderStyle 'none'
                // otherwise)
                if (hasBorder) {
                    cs.setStrokingColor(borderColor);
                    cs.setLineWidth(borderPt);
                    cardPath(cs, bx, by, itemW, itemH, radiusPt);
                    cs.stroke();
                }

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
                    PDFont fieldFont = isBold(style) ? boldFont : font;
                    Color color =
                            parseColor(
                                    style != null ? textOf(style, "color", "") : "",
                                    defaultFieldColor);
                    cs.beginText();
                    cs.setFont(fieldFont, size);
                    cs.setNonStrokingColor(color);
                    cs.newLineAtOffset(fx + 1, fy - size);
                    cs.showText(
                            truncateToWidth(
                                    text, fieldFont, size, floatOf(f, "width", 20) * MM_TO_PT));
                    cs.endText();
                }
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    /**
     * Append a card path at bottom-left ({@code bx}, {@code by}) — a plain rectangle, or a
     * rounded-corner rectangle when {@code radiusPt > 0} (#370). The caller fills or strokes it.
     */
    private static void cardPath(
            PDPageContentStream cs, float bx, float by, float w, float h, float radiusPt)
            throws IOException {
        if (radiusPt <= 0) {
            cs.addRect(bx, by, w, h);
            return;
        }
        float r = Math.min(radiusPt, Math.min(w, h) / 2f);
        float k = 0.5523f * r; // circle-approximation control-point offset
        cs.moveTo(bx + r, by);
        cs.lineTo(bx + w - r, by);
        cs.curveTo(bx + w - r + k, by, bx + w, by + r - k, bx + w, by + r);
        cs.lineTo(bx + w, by + h - r);
        cs.curveTo(bx + w, by + h - r + k, bx + w - r + k, by + h, bx + w - r, by + h);
        cs.lineTo(bx + r, by + h);
        cs.curveTo(bx + r - k, by + h, bx, by + h - r + k, bx, by + h - r);
        cs.lineTo(bx, by + r);
        cs.curveTo(bx, by + r - k, bx + r - k, by, bx + r, by);
        cs.closePath();
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
