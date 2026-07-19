package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
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
 * Renders QR code elements to PDF using ZXing.
 */
public final class QrCodePdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(QrCodePdfRenderer.class);

    @Override
    public String kind() {
        return "qrcode";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        // Accept both the V1 projection shape ({@code props.value}) and the V2
        // element shape (top-level {@code el.value}) via elementTextOf (issue #182).
        String value = elementTextOf(el, "value", "");
        if (value.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }

        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(value, BarcodeFormat.QR_CODE, 100, 100);

            float moduleW = w / matrix.getWidth();
            float moduleH = h / matrix.getHeight();
            cs.setNonStrokingColor(Color.BLACK);
            for (int row = 0; row < matrix.getHeight(); row++) {
                for (int col = 0; col < matrix.getWidth(); col++) {
                    if (matrix.get(col, row)) {
                        cs.addRect(x + col * moduleW, y - (row + 1) * moduleH, moduleW, moduleH);
                    }
                }
            }
            cs.fill();
        } catch (Exception e) {
            log.warn("QR render failed for value '{}': {}", value, e.getMessage());
            renderBorder(cs, x, y, w, h);
        }
    }
}
