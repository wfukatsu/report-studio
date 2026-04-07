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
 * Renders text_cell elements — text inside table/form_grid cells.
 * Handles horizontal alignment (left/center/right), vertical centering via font metrics,
 * and truncation for overflow.
 */
public final class TextCellPdfRenderer implements ElementPdfRenderer {

    @Override
    public String kind() {
        return "text_cell";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.path("props");
        String text = textOf(props, "text", "");
        if (text.isEmpty()) return;

        float fontSize = floatOf(props, "fontSize", 10f);
        String textAlign = textOf(props, "textAlign", "left");
        float padding = 2f;

        boolean bold = props.path("bold").asBoolean(false);
        String fontFamily = textOf(props, "fontFamily", "");
        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);
        String truncated = truncateToWidth(text, font, fontSize, w - padding * 2);

        float textWidth = font.getStringWidth(truncated) / 1000f * fontSize;
        float textX = switch (textAlign) {
            case "right"  -> x + w - textWidth - padding;
            case "center" -> x + (w - textWidth) / 2f;
            default       -> x + padding;
        };

        // Vertical center using font metrics (ascent/descent)
        float ascent = font.getFontDescriptor().getAscent() / 1000f * fontSize;
        float descent = font.getFontDescriptor().getDescent() / 1000f * fontSize;
        float textHeight = ascent - descent;
        float baselineY = y - (h - textHeight) / 2f - ascent;

        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(Color.BLACK);
        cs.newLineAtOffset(textX, baselineY);
        cs.showText(truncated);
        cs.endText();
    }
}
