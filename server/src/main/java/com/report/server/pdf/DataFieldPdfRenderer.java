package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.report.server.ValueFormatter;
import java.awt.Color;
import java.io.IOException;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders V2 {@code dataField} elements to PDF (issue #53).
 *
 * <p>The bound value arrives via {@code props.text} (resolved upstream from the element's {@code
 * fieldKey} by SectionRenderHelper), then the element's {@code format} ({@code CalculationFormat})
 * is applied through {@link ValueFormatter} — the server port of src/lib/numberFormatter.ts. Empty
 * values fall back to {@code fallbackText} (blank when absent; the designer-only gray label
 * placeholder is intentionally not reproduced).
 *
 * <p>Style support ({@code TextStyle} subset): fontSize (pt), bold, fontFamily (serif/mincho
 * switch), color, textAlign (left/center/right).
 */
public final class DataFieldPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_FONT_SIZE = 12f;

    @Override
    public String kind() {
        return "dataField";
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
        JsonNode props = el.get("props");
        String raw = props != null ? textOf(props, "text", "") : "";
        String text;
        if (raw.isEmpty()) {
            text = elementTextOf(el, "fallbackText", "");
        } else {
            JsonNode format = el.get("format");
            if (format == null && props != null) format = props.get("format");
            text =
                    ValueFormatter.applyFormat(
                            props != null && props.has("text")
                                    ? props.get("text")
                                    : el.path("text"),
                            format);
        }
        if (text.isEmpty()) return;

        JsonNode style = el.get("style");
        if (style == null && props != null) style = props.get("style");
        float fontSize =
                style != null ? floatOf(style, "fontSize", DEFAULT_FONT_SIZE) : DEFAULT_FONT_SIZE;
        boolean bold = isBold(style);
        String fontFamily = style != null ? textOf(style, "fontFamily", "") : "";
        String textAlign = style != null ? textOf(style, "textAlign", "left") : "left";
        Color color = parseColor(style != null ? textOf(style, "color", "") : "", Color.BLACK);

        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);
        // em-based letter spacing, same semantics as TextContent/TextPdfRenderer (#319)
        float charSpacing = (style != null ? floatOf(style, "letterSpacing", 0) : 0) * fontSize;
        String truncated = truncateToWidth(text, font, fontSize, w, charSpacing);
        float textWidth =
                font.getStringWidth(truncated) / 1000 * fontSize
                        + truncated.codePointCount(0, truncated.length()) * charSpacing;
        float tx =
                switch (textAlign) {
                    case "center" -> x + (w - textWidth) / 2;
                    case "right" -> x + w - textWidth;
                    default -> x;
                };

        cs.beginText();
        cs.setFont(font, fontSize);
        if (charSpacing != 0) cs.setCharacterSpacing(charSpacing);
        cs.setNonStrokingColor(color);
        cs.newLineAtOffset(tx, y - fontSize);
        cs.showText(truncated);
        cs.endText();
        if (charSpacing != 0) cs.setCharacterSpacing(0);
    }
}
