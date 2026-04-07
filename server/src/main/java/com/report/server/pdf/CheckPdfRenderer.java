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
 * Renders check-related elements (check_mark, checkbox, radio_mark) to PDF.
 */
public final class CheckPdfRenderer implements ElementPdfRenderer {

    private final String elementKind;
    public CheckPdfRenderer(String kind) {
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
        cs.saveGraphicsState();
        switch (elementKind) {
            case "check_mark" -> renderCheckMark(cs, el, x, y, w, h, doc, fontCache);
            case "checkbox" -> renderCheckbox(cs, el, x, y, w, h);
            case "radio_mark" -> renderRadioMark(cs, el, x, y, w, h);
        }
        cs.restoreGraphicsState();
    }

    private void renderCheckMark(PDPageContentStream cs, JsonNode el, float x, float y,
                                 float w, float h, PDDocument doc,
                                 Map<String, PDFont> fontCache) throws IOException {
        PDFont font = FontProvider.getFont(doc, fontCache);
        float fontSize = Math.min(w, h) * 0.8f;
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(Color.BLACK);
        float textX = x + (w - fontSize * 0.6f) / 2;
        float textY = y - h + (h - fontSize) / 2;
        cs.newLineAtOffset(textX, textY);
        cs.showText("\u2713"); // ✓
        cs.endText();
    }

    private static void renderCheckbox(PDPageContentStream cs, JsonNode el, float x, float y,
                                       float w, float h) throws IOException {
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(1);
        cs.addRect(x, y - h, w, h);
        cs.stroke();

        // If checked, draw check mark as paths
        JsonNode props = el.get("props");
        boolean checked = props != null && props.has("checked") && props.get("checked").asBoolean(false);
        if (checked) {
            cs.setStrokingColor(Color.BLACK);
            cs.setLineWidth(2);
            cs.moveTo(x + w * 0.2f, y - h * 0.5f);
            cs.lineTo(x + w * 0.4f, y - h * 0.8f);
            cs.lineTo(x + w * 0.8f, y - h * 0.2f);
            cs.stroke();
        }
    }

    private static void renderRadioMark(PDPageContentStream cs, JsonNode el, float x, float y,
                                        float w, float h) throws IOException {
        float cx = x + w / 2;
        float cy = y - h / 2;
        float r = Math.min(w, h) / 2;

        // Outer circle
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(1);
        drawCircle(cs, cx, cy, r);
        cs.stroke();

        // If selected, fill inner circle
        JsonNode props = el.get("props");
        boolean selected = props != null && props.has("selected") && props.get("selected").asBoolean(false);
        if (selected) {
            cs.setNonStrokingColor(Color.BLACK);
            drawCircle(cs, cx, cy, r * 0.5f);
            cs.fill();
        }
    }

    private static void drawCircle(PDPageContentStream cs, float cx, float cy, float r) throws IOException {
        float k = 0.5522848f * r;
        cs.moveTo(cx - r, cy);
        cs.curveTo(cx - r, cy + k, cx - k, cy + r, cx, cy + r);
        cs.curveTo(cx + k, cy + r, cx + r, cy + k, cx + r, cy);
        cs.curveTo(cx + r, cy - k, cx + k, cy - r, cx, cy - r);
        cs.curveTo(cx - k, cy - r, cx - r, cy - k, cx - r, cy);
        cs.closePath();
    }
}
