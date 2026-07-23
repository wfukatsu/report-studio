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
 * Renders V2 {@code hanko} (印鑑) elements to PDF (issue #53).
 *
 * <p>Mirrors the frontend HankoRenderer (src/elements/hanko/Renderer.tsx): circle or rectangle
 * frame, optional double border, red default colors, and vertical-rl or horizontal text. V2 stores
 * fields at the element top level ({@code text}, {@code shape}, {@code borderColor}, {@code
 * textColor}, {@code fontSize} in mm, {@code writingMode}, {@code doubleBorder}); data-bound values
 * arrive via {@code props.text} (resolved upstream by SectionRenderHelper), which takes precedence.
 */
public final class HankoPdfRenderer implements ElementPdfRenderer {

    private static final Color DEFAULT_RED = new Color(0xCC, 0x00, 0x00);
    private static final float MM_TO_PT = SectionRenderHelper.MM_TO_PT;

    @Override
    public String kind() {
        return "hanko";
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
        // props.text carries the resolved binding; fall back to the design-time text
        JsonNode props = el.get("props");
        String text = props != null ? textOf(props, "text", "") : "";
        if (text.isEmpty()) text = textOf(el, "text", "印");

        String shape = elementTextOf(el, "shape", "circle");
        boolean doubleBorder = elementBoolOf(el, "doubleBorder", true);
        boolean vertical = "vertical-rl".equals(elementTextOf(el, "writingMode", "vertical-rl"));
        Color borderColor = parseColor(elementTextOf(el, "borderColor", ""), DEFAULT_RED);
        Color textColor = parseColor(elementTextOf(el, "textColor", ""), DEFAULT_RED);

        float cx = x + w / 2;
        float cy = y - h / 2;
        float min = Math.min(w, h);

        cs.saveGraphicsState();
        try {
            cs.setStrokingColor(borderColor);
            if ("rectangle".equals(shape)) {
                // Frontend viewBox: outer rect inset 4%, inner inset 10%
                cs.setLineWidth(min * (doubleBorder ? 0.03f : 0.02f));
                cs.addRect(x + w * 0.04f, y - h + h * 0.04f, w * 0.92f, h * 0.92f);
                cs.stroke();
                if (doubleBorder) {
                    cs.setLineWidth(min * 0.015f);
                    cs.addRect(x + w * 0.10f, y - h + h * 0.10f, w * 0.80f, h * 0.80f);
                    cs.stroke();
                }
            } else {
                // Frontend viewBox: outer circle r=46%, inner r=40% of the box
                cs.setLineWidth(min * (doubleBorder ? 0.03f : 0.02f));
                drawCircle(cs, cx, cy, min * 0.46f);
                cs.stroke();
                if (doubleBorder) {
                    cs.setLineWidth(min * 0.015f);
                    drawCircle(cs, cx, cy, min * 0.40f);
                    cs.stroke();
                }
            }

            // Frontend renders text inside a 100-unit viewBox scaled to the box, at
            // fontSize = el.fontSize * 3.78 (viewBox units) — so the effective size is
            // el.fontSize * 3.78/100 * boxSize, not el.fontSize mm directly (#373).
            float fontSizeMm = elementFloatOf(el, "fontSize", 0);
            float fontSize = fontSizeMm > 0 ? fontSizeMm * (3.78f / 100f) * min : min * 0.35f;
            PDFont font = FontProvider.getFont(doc, fontCache);
            cs.setNonStrokingColor(textColor);

            if (vertical && text.length() > 1) {
                drawVertical(cs, font, fontSize, text, cx, cy);
            } else {
                float textWidth = font.getStringWidth(text) / 1000 * fontSize;
                cs.beginText();
                cs.setFont(font, fontSize);
                cs.newLineAtOffset(cx - textWidth / 2, cy - fontSize * 0.35f);
                cs.showText(text);
                cs.endText();
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    /** Stack characters top-to-bottom, centered on the seal. */
    private static void drawVertical(
            PDPageContentStream cs, PDFont font, float fontSize, String text, float cx, float cy)
            throws IOException {
        int[] codePoints = text.codePoints().toArray();
        float totalHeight = codePoints.length * fontSize;
        float top = cy + totalHeight / 2;
        for (int i = 0; i < codePoints.length; i++) {
            String ch = new String(Character.toChars(codePoints[i]));
            float chWidth = font.getStringWidth(ch) / 1000 * fontSize;
            float baseline = top - (i + 1) * fontSize + fontSize * 0.15f;
            cs.beginText();
            cs.setFont(font, fontSize);
            cs.newLineAtOffset(cx - chWidth / 2, baseline);
            cs.showText(ch);
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
