package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.io.IOException;
import java.util.Map;

/**
 * Interface for element-kind-specific PDF rendering.
 * Each implementation handles one element kind (text, shape, barcode, etc.).
 *
 * fontCache is passed per-template to avoid thread-safety issues
 * when the registry is shared across concurrent batch jobs.
 */
public interface ElementPdfRenderer {

    /** The element kind this renderer handles (e.g., "text", "shape"). */
    String kind();

    /**
     * Render the element to the PDF page.
     *
     * @param cs         content stream for the current page
     * @param el         JSON node of the element (contains props, name, etc.)
     * @param x          x position in PDF points (already converted from mm)
     * @param y          y position in PDF points (top-left, PDF coordinate space)
     * @param w          width in PDF points
     * @param h          height in PDF points
     * @param pageHeight page height in PDF points (for coordinate transforms)
     * @param doc        the PDF document (for loading fonts/images)
     * @param fontCache  per-document font cache (created fresh per renderTemplate call)
     */
    void render(PDPageContentStream cs, JsonNode el, float x, float y,
                float w, float h, float pageHeight, PDDocument doc,
                Map<String, PDFont> fontCache) throws IOException;
}
