package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Generic single-line text renderer for elements whose value is resolved
 * upstream into {@code props.text} — used for V2 {@code pageNumber} and
 * {@code currentDate} (issue #54), whose values SectionRenderHelper computes
 * from the page context before dispatch.
 *
 * <p>Honors the element's {@code style} (TextStyle subset): fontSize, bold,
 * fontFamily, color, textAlign.
 */
public final class StyledTextPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_FONT_SIZE = 10f;

    private final String elementKind;

    public StyledTextPdfRenderer(String kind) {
        this.elementKind = kind;
    }

    @Override
    public String kind() {
        return elementKind;
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.get("props");
        String text = props != null ? textOf(props, "text", "") : "";
        if (text.isEmpty()) return;

        JsonNode style = el.get("style");
        if (style == null && props != null) style = props.get("style");
        float fontSize = style != null ? floatOf(style, "fontSize", DEFAULT_FONT_SIZE) : DEFAULT_FONT_SIZE;
        boolean bold = style != null && boolOf(style, "bold", false);
        String fontFamily = style != null ? textOf(style, "fontFamily", "") : "";
        String textAlign = style != null ? textOf(style, "textAlign", "left") : "left";
        Color color = parseColor(style != null ? textOf(style, "color", "") : "", Color.BLACK);

        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);
        String truncated = truncateToWidth(text, font, fontSize, w);
        float textWidth = font.getStringWidth(truncated) / 1000 * fontSize;
        float tx = switch (textAlign) {
            case "center" -> x + (w - textWidth) / 2;
            case "right" -> x + w - textWidth;
            default -> x;
        };

        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(color);
        cs.newLineAtOffset(tx, y - fontSize);
        cs.showText(truncated);
        cs.endText();
    }
}
