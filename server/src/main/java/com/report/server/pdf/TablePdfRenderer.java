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
 * Renders table elements — grid lines with optional header row background. Cell text is rendered
 * independently by TextCellPdfRenderer (flat element model).
 */
public final class TablePdfRenderer implements ElementPdfRenderer {

    private static final Color HEADER_BG = new Color(241, 245, 249); // #f1f5f9

    @Override
    public String kind() {
        return "table";
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
        int columns = Math.max(1, (int) floatOf(props, "columns", 3f));
        int headerRows = Math.max(0, (int) floatOf(props, "headerRows", 1f));
        int totalRows = Math.max(1, headerRows + 1);

        cs.saveGraphicsState();
        try {
            // Header row background
            if (headerRows > 0) {
                float rowH = h / totalRows;
                cs.setNonStrokingColor(HEADER_BG);
                cs.addRect(x, y - headerRows * rowH, w, headerRows * rowH);
                cs.fill();
            }

            // Grid lines (single stroke via helper)
            drawGrid(cs, x, y, w, h, columns, totalRows, 0.5f, Color.LIGHT_GRAY);
        } finally {
            cs.restoreGraphicsState();
        }
    }
}
