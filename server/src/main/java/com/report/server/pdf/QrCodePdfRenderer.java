package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.awt.Color;
import java.io.IOException;
import java.util.EnumMap;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Renders QR code elements to PDF using ZXing. */
public final class QrCodePdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(QrCodePdfRenderer.class);

    @Override
    public String kind() {
        return "qrcode";
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
        // Accept both the V1 projection shape ({@code props.value}) and the V2
        // element shape (top-level {@code el.value}) via elementTextOf (issue #182).
        String value = elementTextOf(el, "value", "");
        if (value.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }

        // Front parity (#367): foreground/background colors and the error-correction level
        // (ZXing defaults to L; the frontend QRCodeSVG defaults to M).
        Color fg = parseColor(elementTextOf(el, "darkColor", ""), Color.BLACK);
        Color bg = parseColor(elementTextOf(el, "lightColor", ""), Color.WHITE);
        ErrorCorrectionLevel ec = toErrorCorrectionLevel(elementTextOf(el, "errorCorrection", "M"));

        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ec);
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(value, BarcodeFormat.QR_CODE, 100, 100, hints);

            float moduleW = w / matrix.getWidth();
            float moduleH = h / matrix.getHeight();

            // Background fills the whole frame (front QRCodeSVG has an opaque bgColor).
            cs.setNonStrokingColor(bg);
            cs.addRect(x, y - h, w, h);
            cs.fill();

            cs.setNonStrokingColor(fg);
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

    private static ErrorCorrectionLevel toErrorCorrectionLevel(String level) {
        return switch (level == null ? "" : level.toUpperCase()) {
            case "L" -> ErrorCorrectionLevel.L;
            case "Q" -> ErrorCorrectionLevel.Q;
            case "H" -> ErrorCorrectionLevel.H;
            default -> ErrorCorrectionLevel.M;
        };
    }
}
