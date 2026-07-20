package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders seal_box (印鑑枠) and signature_line elements to PDF. seal_box: single red circle + centered
 * text (matching frontend rendering). signature_line: underline + label text.
 */
public final class SealBoxPdfRenderer implements ElementPdfRenderer {

    private static final Color SEAL_RED = new Color(0xCC, 0x00, 0x00);
    private final String elementKind;

    public SealBoxPdfRenderer(String kind) {
        this.elementKind = kind;
    }

    @Override
    public String kind() {
        return elementKind;
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
        cs.saveGraphicsState();
        switch (elementKind) {
            case "seal_box" -> renderSealBox(cs, el, x, y, w, h, doc, fontCache);
            case "signature_line" -> renderSignatureLine(cs, el, x, y, w, h, doc, fontCache);
        }
        cs.restoreGraphicsState();
    }

    private void renderSealBox(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        float cx = x + w / 2;
        float cy = y - h / 2;
        float r = Math.min(w, h) / 2;

        // Red circle
        cs.setStrokingColor(SEAL_RED);
        cs.setLineWidth(1.5f);
        drawCircle(cs, cx, cy, r);
        cs.stroke();

        // Centered text (「印」 or element name)
        JsonNode props = el.get("props");
        String text = props != null ? textOf(props, "text", "印") : "印";
        PDFont font = FontProvider.getFont(doc, fontCache);
        float fontSize = r * 0.8f;

        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(SEAL_RED);
        float textWidth = font.getStringWidth(text) / 1000 * fontSize;
        cs.newLineAtOffset(cx - textWidth / 2, cy - fontSize * 0.35f);
        cs.showText(text);
        cs.endText();
    }

    private void renderSignatureLine(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        // Underline
        float lineY = y - h + 2;
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(0.5f);
        cs.moveTo(x, lineY);
        cs.lineTo(x + w, lineY);
        cs.stroke();

        // Label text above line
        JsonNode props = el.get("props");
        String label = props != null ? textOf(props, "text", "") : textOf(el, "name", "");
        if (!label.isEmpty()) {
            PDFont font = FontProvider.getFont(doc, fontCache);
            float fontSize = 8;
            cs.beginText();
            cs.setFont(font, fontSize);
            cs.setNonStrokingColor(Color.GRAY);
            cs.newLineAtOffset(x, lineY + 4);
            cs.showText(label);
            cs.endText();
        }
    }

    private static void drawCircle(PDPageContentStream cs, float cx, float cy, float r)
            throws IOException {
        float k = 0.5522848f * r;
        cs.moveTo(cx - r, cy);
        cs.curveTo(cx - r, cy + k, cx - k, cy + r, cx, cy + r);
        cs.curveTo(cx + k, cy + r, cx + r, cy + k, cx + r, cy);
        cs.curveTo(cx + r, cy - k, cx + k, cy - r, cx, cy - r);
        cs.curveTo(cx - k, cy - r, cx - r, cy - k, cx - r, cy);
        cs.closePath();
    }
}
