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
 * Renders form_grid elements — black grid lines for Japanese legal forms. Thick outer border
 * (0.75pt) + thinner inner dividers (0.4pt).
 */
public final class FormGridPdfRenderer implements ElementPdfRenderer {

    @Override
    public String kind() {
        return "form_grid";
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
        JsonNode props = el.path("props");
        int cols = Math.max(1, (int) floatOf(props, "cols", 4f));
        int rows = Math.max(1, (int) floatOf(props, "rows", 5f));

        cs.saveGraphicsState();
        try {
            // Thick outer border
            cs.setStrokingColor(Color.BLACK);
            cs.setLineWidth(0.75f);
            cs.addRect(x, y - h, w, h);
            cs.stroke();

            // Inner grid lines (thinner)
            drawGrid(cs, x, y, w, h, cols, rows, 0.4f, Color.BLACK);
        } finally {
            cs.restoreGraphicsState();
        }
    }
}
