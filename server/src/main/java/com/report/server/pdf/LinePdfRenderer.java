package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

/**
 * Renders line elements to PDF.
 */
public final class LinePdfRenderer implements ElementPdfRenderer {

    @Override
    public String kind() {
        return "line";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(1);
        cs.moveTo(x, y);
        cs.lineTo(x + w, y - h);
        cs.stroke();
    }
}
