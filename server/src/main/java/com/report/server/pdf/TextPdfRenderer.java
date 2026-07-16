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
 * Renders text elements to PDF using Noto Sans JP for CJK support.
 * Font bytes are cached at JVM level; PDFont instances are per-document (for subsetting).
 */
public final class TextPdfRenderer implements ElementPdfRenderer {

    @Override
    public String kind() {
        return "text";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.get("props");
        // V1 stores the string in props.text; V2 TextElement stores it in
        // `content` at the element top level (src/types/index.ts). Resolve in
        // priority order so V2 definitions render their content (issue #52).
        String text = props != null ? textOf(props, "text", "") : "";
        if (text.isEmpty()) text = textOf(el, "content", "");
        if (text.isEmpty()) text = textOf(el, "name", "");
        if (text.isEmpty()) return;

        // V2 text style lives in `style`; V1 in `props`
        JsonNode style = el.get("style");
        float fontSize = props != null ? floatOf(props, "fontSize", 0) : 0;
        if (fontSize == 0 && style != null) fontSize = floatOf(style, "fontSize", 0);
        if (fontSize == 0) fontSize = 12;
        boolean bold = (props != null && props.path("bold").asBoolean(false))
                || (style != null && style.path("bold").asBoolean(false));
        String fontFamily = props != null ? textOf(props, "fontFamily", "") : "";
        if (fontFamily.isEmpty() && style != null) fontFamily = textOf(style, "fontFamily", "");
        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);

        String colorHex = props != null ? textOf(props, "color", "") : "";
        if (colorHex.isEmpty() && style != null) colorHex = textOf(style, "color", "");
        Color color = parseColor(colorHex, Color.BLACK);
        String align = props != null ? textOf(props, "textAlign", "") : "";
        if (align.isEmpty() && style != null) align = textOf(style, "textAlign", "left");

        String truncated = truncateToWidth(text, font, fontSize, w);
        float textWidth = font.getStringWidth(truncated) / 1000 * fontSize;
        float tx = switch (align) {
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
