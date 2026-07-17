package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders V2 {@code approvalStampRow} (承認印欄) elements to PDF (issue #53).
 *
 * <p>Mirrors the frontend ApprovalStampRowRenderer: a bordered row of cells
 * with fixed mm widths, each carrying a 4mm role-label band at the top or
 * bottom. Stamp images ({@code cells[].stampSrc} — data URI or SSRF-guarded
 * URL, resolved via {@link ImagePdfRenderer#resolveImageBytes}) are drawn
 * aspect-fit and centred in the stamp area at max 80% size and 85% opacity,
 * matching the designer preview (issue #74). A cell whose image cannot be
 * loaded falls back to the blank-cell rendering instead of failing the PDF.
 */
public final class ApprovalStampRowPdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(ApprovalStampRowPdfRenderer.class);

    private static final float MM_TO_PT = SectionRenderHelper.MM_TO_PT;
    private static final float LABEL_BAND_PT = 4 * MM_TO_PT;
    private static final float LABEL_FONT_PT = 2.5f * MM_TO_PT;
    private static final Color LABEL_COLOR = new Color(0x37, 0x41, 0x51);
    /** Designer: {@code maxWidth/maxHeight: 80%} of the stamp area. */
    private static final float STAMP_MAX_RATIO = 0.8f;
    /** Designer: {@code opacity: 0.85}. */
    private static final float STAMP_OPACITY = 0.85f;

    @Override
    public String kind() {
        return "approvalStampRow";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode cells = el.get("cells");
        if (cells == null || !cells.isArray() || cells.isEmpty()) {
            JsonNode props = el.get("props");
            cells = props != null ? props.get("cells") : null;
        }
        if (cells == null || !cells.isArray() || cells.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }

        Color borderColor = parseColor(elementTextOf(el, "borderColor", ""), Color.BLACK);
        float borderWidthPt = Math.max(elementFloatOf(el, "borderWidth", 0.3f), 0.1f) * MM_TO_PT;
        boolean labelTop = "top".equals(elementTextOf(el, "labelPosition", "bottom"));

        PDFont font = FontProvider.getFont(doc, fontCache);

        cs.saveGraphicsState();
        try {
            cs.setStrokingColor(borderColor);
            cs.setLineWidth(borderWidthPt);

            // Outer border
            cs.addRect(x, y - h, w, h);
            cs.stroke();

            // Label band separator line across the full row
            float bandY = labelTop ? y - LABEL_BAND_PT : y - h + LABEL_BAND_PT;
            cs.moveTo(x, bandY);
            cs.lineTo(x + w, bandY);
            cs.stroke();

            float cellX = x;
            for (int i = 0; i < cells.size(); i++) {
                JsonNode cell = cells.get(i);
                float cellW = floatOf(cell, "width", 15f) * MM_TO_PT;

                // Vertical separator (not after the last cell)
                if (i < cells.size() - 1) {
                    cs.moveTo(cellX + cellW, y);
                    cs.lineTo(cellX + cellW, y - h);
                    cs.stroke();
                }

                // Centered role label inside the band
                String role = textOf(cell, "role", "");
                if (!role.isEmpty()) {
                    float textWidth = font.getStringWidth(role) / 1000 * LABEL_FONT_PT;
                    float bandCenterY = labelTop ? y - LABEL_BAND_PT / 2 : y - h + LABEL_BAND_PT / 2;
                    cs.beginText();
                    cs.setFont(font, LABEL_FONT_PT);
                    cs.setNonStrokingColor(LABEL_COLOR);
                    cs.newLineAtOffset(cellX + (cellW - textWidth) / 2,
                            bandCenterY - LABEL_FONT_PT * 0.35f);
                    cs.showText(role);
                    cs.endText();
                }

                // Stamp image centred in the cell's stamp area (issue #74)
                String stampSrc = textOf(cell, "stampSrc", "");
                if (!stampSrc.isEmpty()) {
                    drawStamp(cs, doc, stampSrc, cellX, y, cellW, h, labelTop);
                }

                cellX += cellW;
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    /**
     * Draw one cell's stamp image: aspect-fit into a centred box covering at
     * most {@value #STAMP_MAX_RATIO} of the stamp area (the cell minus the
     * label band), at {@value #STAMP_OPACITY} opacity — the designer preview's
     * {@code maxWidth/maxHeight: 80%; opacity: 0.85}. Any load or draw failure
     * only logs a warning; the cell keeps its blank-cell rendering.
     */
    private static void drawStamp(PDPageContentStream cs, PDDocument doc, String stampSrc,
                                  float cellX, float rowTopY, float cellW, float rowH,
                                  boolean labelTop) {
        byte[] imageBytes = ImagePdfRenderer.resolveImageBytes(stampSrc);
        if (imageBytes == null) return; // blank cell — same as no stampSrc

        float areaH = rowH - LABEL_BAND_PT;
        if (areaH <= 0 || cellW <= 0) return;
        float areaTopY = labelTop ? rowTopY - LABEL_BAND_PT : rowTopY;

        float boxW = cellW * STAMP_MAX_RATIO;
        float boxH = areaH * STAMP_MAX_RATIO;
        float boxX = cellX + (cellW - boxW) / 2;
        float boxTopY = areaTopY - (areaH - boxH) / 2;

        try {
            cs.saveGraphicsState();
            try {
                PDExtendedGraphicsState alpha = new PDExtendedGraphicsState();
                alpha.setNonStrokingAlphaConstant(STAMP_OPACITY);
                cs.setGraphicsStateParameters(alpha);
                ImagePdfRenderer.drawImage(cs, boxX, boxTopY, boxW, boxH, doc, imageBytes);
            } finally {
                cs.restoreGraphicsState();
            }
        } catch (Exception e) {
            log.warn("Failed to render approval stamp image: {}", e.getMessage());
        }
    }
}
