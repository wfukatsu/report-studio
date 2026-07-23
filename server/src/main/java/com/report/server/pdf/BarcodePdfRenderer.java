package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import java.awt.Color;
import java.io.IOException;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Renders barcode elements to PDF using ZXing. */
public final class BarcodePdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(BarcodePdfRenderer.class);
    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;

    @Override
    public String kind() {
        return "barcode";
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
        // Accept both the V1 projection shape ({@code props.value/props.format})
        // and the V2 element shape ({@code el.value} + {@code el.kind} as the
        // format) via elementTextOf, which reads top-level first then props
        // (issue #182).
        String value = elementTextOf(el, "value", "");
        if (value.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }

        // Front parity (#367): bar color, background color, and the human-readable caption
        Color dark = parseColor(elementTextOf(el, "darkColor", ""), Color.BLACK);
        Color light = parseColor(elementTextOf(el, "lightColor", ""), Color.WHITE);
        boolean showText = elementBoolOf(el, "showText", true);

        try {
            String format = elementTextOf(el, "format", "");
            if (format.isEmpty()) format = textOf(el, "kind", "CODE_128");
            BarcodeFormat bf = toBarcodeFormat(format);

            // Reserve a caption band at the bottom when showText, so bars don't overlap it.
            float captionFont = showText ? Math.min(8f, h * 0.35f) : 0f;
            float captionH = showText ? captionFont * 1.5f : 0f;
            float barsH = Math.max(1f, h - captionH);

            BitMatrix matrix =
                    new MultiFormatWriter()
                            .encode(
                                    value,
                                    bf,
                                    (int) (w / MM_TO_PT * 3),
                                    (int) (barsH / MM_TO_PT * 3));

            // Background fills the whole frame (front <svg> has an opaque background).
            cs.setNonStrokingColor(light);
            cs.addRect(x, y - h, w, h);
            cs.fill();

            // Bars occupy the top region above the caption band.
            float barWidth = w / matrix.getWidth();
            cs.setNonStrokingColor(dark);
            for (int col = 0; col < matrix.getWidth(); col++) {
                boolean hasBlack = false;
                for (int row = 0; row < matrix.getHeight(); row++) {
                    if (matrix.get(col, row)) {
                        hasBlack = true;
                        break;
                    }
                }
                if (hasBlack) {
                    cs.addRect(x + col * barWidth, y - barsH, barWidth, barsH);
                }
            }
            cs.fill();

            // Caption: the value, centred below the bars.
            if (showText && captionFont > 0) {
                PDFont font = FontProvider.getFont(doc, fontCache);
                float textW = font.getStringWidth(value) / 1000 * captionFont;
                float tx = x + (w - textW) / 2;
                cs.beginText();
                cs.setFont(font, captionFont);
                cs.setNonStrokingColor(dark);
                cs.newLineAtOffset(tx, y - barsH - captionFont);
                cs.showText(value);
                cs.endText();
            }
        } catch (Exception e) {
            log.warn("Barcode render failed for value '{}': {}", value, e.getMessage());
            renderBorder(cs, x, y, w, h);
        }
    }

    private static BarcodeFormat toBarcodeFormat(String format) {
        return switch (format.toUpperCase().replace("-", "_")) {
            case "CODE39", "CODE_39" -> BarcodeFormat.CODE_39;
            case "JAN13", "JAN_13", "EAN13", "EAN_13" -> BarcodeFormat.EAN_13;
            case "EAN8", "EAN_8" -> BarcodeFormat.EAN_8;
            case "UPC", "UPC_A" -> BarcodeFormat.UPC_A;
            case "ITF14", "ITF_14", "ITF" -> BarcodeFormat.ITF;
            case "CODABAR" -> BarcodeFormat.CODABAR;
            default -> BarcodeFormat.CODE_128;
        };
    }
}
