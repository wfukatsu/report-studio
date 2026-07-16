package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.report.server.ValueFormatter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders {@code row_block} elements — the per-row cells of detail_table /
 * multi_row_table sections (issue #55).
 *
 * <p>Replaces the previous no-op registration, which silently dropped every
 * data row from the PDF. The bound value arrives via {@code props.text}
 * (resolved per row by SectionRenderHelper.resolveDetailRow with the frame
 * already offset to the row's position); an optional {@code format}
 * (CalculationFormat) is applied through {@link ValueFormatter}.
 *
 * <p>Rows with no resolved value draw nothing — an empty cell, never a
 * design-time placeholder.
 */
public final class RowBlockPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_FONT_SIZE = 10f;

    @Override
    public String kind() {
        return "row_block";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.get("props");
        if (props == null || textOf(props, "text", "").isEmpty()) return;

        JsonNode format = el.get("format");
        if (format == null) format = props.get("format");
        String text = ValueFormatter.applyFormat(props.get("text"), format);
        if (text.isEmpty()) return;

        float fontSize = floatOf(props, "fontSize", DEFAULT_FONT_SIZE);
        boolean bold = boolOf(props, "bold", false);
        String fontFamily = textOf(props, "fontFamily", "");
        String align = textOf(props, "align", textOf(props, "textAlign", "left"));
        Color color = parseColor(textOf(props, "color", ""), Color.BLACK);

        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);
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
