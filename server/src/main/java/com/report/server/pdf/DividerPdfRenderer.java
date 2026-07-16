package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders V2 {@code divider} elements to PDF (issue #53).
 *
 * <p>Mirrors the frontend DividerRenderer (src/elements/divider/Renderer.tsx):
 * a horizontal divider draws through the vertical center of the frame, a
 * vertical one through the horizontal center. Dash patterns match the
 * frontend's mm-based map (dashed = 4mm/2mm, dotted = 1mm/1mm).
 */
public final class DividerPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = SectionRenderHelper.MM_TO_PT;
    private static final float DEFAULT_THICKNESS_MM = 0.3f;

    @Override
    public String kind() {
        return "divider";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        boolean horizontal = !"vertical".equals(elementTextOf(el, "direction", "horizontal"));
        Color color = parseColor(elementTextOf(el, "color", ""), Color.BLACK);
        float thicknessMm = elementFloatOf(el, "thickness", DEFAULT_THICKNESS_MM);
        String dashStyle = elementTextOf(el, "dashStyle", "solid");

        cs.saveGraphicsState();
        try {
            cs.setStrokingColor(color);
            cs.setLineWidth(Math.max(thicknessMm, 0.1f) * MM_TO_PT);
            switch (dashStyle) {
                case "dashed" -> cs.setLineDashPattern(new float[]{4 * MM_TO_PT, 2 * MM_TO_PT}, 0);
                case "dotted" -> cs.setLineDashPattern(new float[]{1 * MM_TO_PT, 1 * MM_TO_PT}, 0);
                default -> { /* solid */ }
            }
            if (horizontal) {
                cs.moveTo(x, y - h / 2);
                cs.lineTo(x + w, y - h / 2);
            } else {
                cs.moveTo(x + w / 2, y);
                cs.lineTo(x + w / 2, y - h);
            }
            cs.stroke();
        } finally {
            cs.restoreGraphicsState();
        }
    }
}
