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
 * Renders V2 {@code revenueStamp} (収入印紙枠) elements to PDF (issue #53).
 *
 * <p>Mirrors the frontend RevenueStampRenderer (src/elements/revenueStamp/ Renderer.tsx): bordered
 * box with a light background, optional 収入印紙 label (top-left), optional amount (bottom-right), and
 * an optional dashed vertical cancellation guide through the center.
 */
public final class RevenueStampPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = SectionRenderHelper.MM_TO_PT;
    private static final Color BACKGROUND = new Color(0xFA, 0xFA, 0xFA);
    private static final Color LABEL_GRAY = new Color(0x6B, 0x72, 0x80);
    private static final Color AMOUNT_GRAY = new Color(0x9C, 0xA3, 0xAF);
    private static final Color GUIDE_GRAY = new Color(0xE5, 0xE7, 0xEB);
    private static final float SMALL_FONT_PT = 2.5f * MM_TO_PT;

    @Override
    public String kind() {
        return "revenueStamp";
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
        Color borderColor = parseColor(elementTextOf(el, "borderColor", ""), Color.BLACK);
        float borderWidthPt = Math.max(elementFloatOf(el, "borderWidth", 0.3f), 0.1f) * MM_TO_PT;
        boolean showLabel = elementBoolOf(el, "showLabel", true);
        boolean showGuide = elementBoolOf(el, "showCancellationGuide", true);
        String amount = elementTextOf(el, "amount", "");

        cs.saveGraphicsState();
        try {
            // Background + border
            cs.setNonStrokingColor(BACKGROUND);
            cs.addRect(x, y - h, w, h);
            cs.fill();
            cs.setStrokingColor(borderColor);
            cs.setLineWidth(borderWidthPt);
            cs.addRect(x, y - h, w, h);
            cs.stroke();

            // Dashed vertical cancellation guide through the center
            if (showGuide) {
                cs.setStrokingColor(GUIDE_GRAY);
                cs.setLineWidth(0.5f);
                cs.setLineDashPattern(new float[] {3, 2}, 0);
                cs.moveTo(x + w / 2, y);
                cs.lineTo(x + w / 2, y - h);
                cs.stroke();
                cs.setLineDashPattern(new float[] {}, 0);
            }

            PDFont font = FontProvider.getFont(doc, fontCache);
            if (showLabel) {
                cs.beginText();
                cs.setFont(font, SMALL_FONT_PT);
                cs.setNonStrokingColor(LABEL_GRAY);
                cs.newLineAtOffset(x + 1.5f * MM_TO_PT, y - 1 * MM_TO_PT - SMALL_FONT_PT);
                cs.showText("収入印紙");
                cs.endText();
            }
            if (!amount.isEmpty()) {
                float textWidth = font.getStringWidth(amount) / 1000 * SMALL_FONT_PT;
                cs.beginText();
                cs.setFont(font, SMALL_FONT_PT);
                cs.setNonStrokingColor(AMOUNT_GRAY);
                cs.newLineAtOffset(
                        x + w - textWidth - 1.5f * MM_TO_PT,
                        y - h + 1 * MM_TO_PT + SMALL_FONT_PT * 0.2f);
                cs.showText(amount);
                cs.endText();
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }
}
