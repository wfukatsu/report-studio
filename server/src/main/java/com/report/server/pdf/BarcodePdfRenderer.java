package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders barcode elements to PDF using ZXing.
 */
public final class BarcodePdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(BarcodePdfRenderer.class);
    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;

    @Override
    public String kind() {
        return "barcode";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.get("props");
        String value = props != null ? textOf(props, "value", "") : "";
        if (value.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }

        try {
            String format = props != null ? textOf(props, "format", "CODE_128") : "CODE_128";
            BarcodeFormat bf = toBarcodeFormat(format);
            BitMatrix matrix = new MultiFormatWriter().encode(value, bf, (int) (w / MM_TO_PT * 3), (int) (h / MM_TO_PT * 3));

            float barWidth = w / matrix.getWidth();
            cs.setNonStrokingColor(Color.BLACK);
            for (int col = 0; col < matrix.getWidth(); col++) {
                boolean hasBlack = false;
                for (int row = 0; row < matrix.getHeight(); row++) {
                    if (matrix.get(col, row)) { hasBlack = true; break; }
                }
                if (hasBlack) {
                    cs.addRect(x + col * barWidth, y - h, barWidth, h);
                }
            }
            cs.fill();
        } catch (Exception e) {
            log.warn("Barcode render failed for value '{}': {}", value, e.getMessage());
            renderBorder(cs, x, y, w, h);
        }
    }

    private static BarcodeFormat toBarcodeFormat(String format) {
        return switch (format.toUpperCase().replace("-", "_")) {
            case "CODE39", "CODE_39" -> BarcodeFormat.CODE_39;
            case "EAN13", "EAN_13" -> BarcodeFormat.EAN_13;
            case "EAN8", "EAN_8" -> BarcodeFormat.EAN_8;
            case "UPC", "UPC_A" -> BarcodeFormat.UPC_A;
            case "ITF14", "ITF_14", "ITF" -> BarcodeFormat.ITF;
            case "CODABAR" -> BarcodeFormat.CODABAR;
            default -> BarcodeFormat.CODE_128;
        };
    }
}
