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
        String text = props != null ? textOf(props, "text", textOf(el, "name", "")) : textOf(el, "name", "");
        if (text.isEmpty()) return;

        float fontSize = props != null ? floatOf(props, "fontSize", 12) : 12;
        boolean bold = props != null && props.path("bold").asBoolean(false);
        String fontFamily = props != null ? textOf(props, "fontFamily", "") : "";
        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);

        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(Color.BLACK);
        cs.newLineAtOffset(x, y - fontSize);
        String truncated = truncateToWidth(text, font, fontSize, w);
        cs.showText(truncated);
        cs.endText();
    }
}
