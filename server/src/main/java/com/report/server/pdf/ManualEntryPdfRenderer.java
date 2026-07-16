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
 * Renders V2 {@code manualEntry} (記入欄) elements to PDF (issue #53).
 *
 * <p>Mirrors the frontend ManualEntryRenderer: an optional label (top/left),
 * an input area drawn as an underline ({@code line}), a full box
 * ({@code box}), or evenly-spaced grid cells ({@code grid} with
 * {@code gridCount}), plus an optional faint placeholder. The furigana zone
 * ({@code furiganaEnabled}) adds an underlined ruby strip above the main area.
 *
 * <p>The area is meant to be filled in by hand, so bound values are not
 * resolved here except the optional furigana preview
 * ({@code props.furiganaText}, resolved upstream from
 * {@code furiganaDataSource}).
 */
public final class ManualEntryPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;
    private static final float BORDER_PT = 0.3f * MM_TO_PT;
    private static final float LABEL_FONT_PT = 2.8f * MM_TO_PT;

    @Override
    public String kind() {
        return "manualEntry";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        String label = elementTextOf(el, "label", "");
        String labelPos = elementTextOf(el, "labelPosition", "top");
        String mode = elementTextOf(el, "displayMode", "line");
        Color lineColor = parseColor(elementTextOf(el, "lineColor", ""), Color.BLACK);
        String placeholder = elementTextOf(el, "placeholder", "");
        PDFont font = FontProvider.getFont(doc, fontCache);

        cs.saveGraphicsState();
        try {
            float areaX = x, areaTop = y, areaW = w, areaH = h;

            // Furigana zone (top strip)
            boolean furigana = elementBoolOf(el, "furiganaEnabled", false);
            if (furigana) {
                float ratio = clamp(elementFloatOf(el, "furiganaRatio", 0.35f), 0.1f, 0.8f);
                float zoneH = h * ratio;
                drawLabelText(cs, font, "フリガナ", 2.2f * MM_TO_PT, lineColor,
                        areaX, areaTop - 2.2f * MM_TO_PT);
                float furiLineY = areaTop - zoneH + 1f;
                stroke(cs, lineColor, areaX, furiLineY, areaX + w, furiLineY);
                // Furigana preview value is resolved upstream into props.text
                JsonNode props = el.get("props");
                String furiText = props != null ? textOf(props, "text", "") : "";
                if (!furiText.isEmpty()) {
                    drawLabelText(cs, font, furiText, 2.8f * MM_TO_PT, Color.BLACK,
                            areaX, furiLineY + 1f);
                }
                areaTop -= zoneH;
                areaH -= zoneH;
            }

            // Label placement in the main zone
            if (!"none".equals(labelPos) && !label.isEmpty()) {
                if ("left".equals(labelPos)) {
                    float labelW = font.getStringWidth(label) / 1000 * LABEL_FONT_PT + 1f * MM_TO_PT;
                    drawLabelText(cs, font, label, LABEL_FONT_PT, Color.BLACK,
                            areaX, areaTop - areaH / 2 - LABEL_FONT_PT * 0.35f);
                    areaX += labelW;
                    areaW -= labelW;
                } else { // top
                    drawLabelText(cs, font, label, LABEL_FONT_PT, Color.BLACK,
                            areaX, areaTop - LABEL_FONT_PT);
                    areaTop -= LABEL_FONT_PT * 1.4f;
                    areaH -= LABEL_FONT_PT * 1.4f;
                }
            }

            // Input area
            float bottom = areaTop - areaH;
            cs.setStrokingColor(lineColor);
            cs.setLineWidth(BORDER_PT);
            switch (mode) {
                case "box" -> {
                    cs.addRect(areaX, bottom, areaW, areaH);
                    cs.stroke();
                }
                case "grid" -> {
                    cs.addRect(areaX, bottom, areaW, areaH);
                    cs.stroke();
                    int cells = Math.max(elementIntOf(el, "gridCount", 0), 0);
                    for (int i = 1; i < cells; i++) {
                        float gx = areaX + areaW * i / cells;
                        cs.moveTo(gx, areaTop);
                        cs.lineTo(gx, bottom);
                        cs.stroke();
                    }
                }
                default -> stroke(cs, lineColor, areaX, bottom + 1f, areaX + areaW, bottom + 1f); // line
            }

            // Placeholder (faint, centered)
            if (!placeholder.isEmpty()) {
                float ph = LABEL_FONT_PT;
                float tw = font.getStringWidth(placeholder) / 1000 * ph;
                cs.setNonStrokingColor(new Color(150, 150, 150));
                cs.beginText();
                cs.setFont(font, ph);
                cs.newLineAtOffset(areaX + (areaW - tw) / 2, bottom + areaH / 2 - ph * 0.35f);
                cs.showText(placeholder);
                cs.endText();
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    private static void drawLabelText(PDPageContentStream cs, PDFont font, String text,
                                      float size, Color color, float x, float baselineY) throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.setNonStrokingColor(color);
        cs.newLineAtOffset(x, baselineY);
        cs.showText(text);
        cs.endText();
    }

    private static void stroke(PDPageContentStream cs, Color color,
                               float x1, float y1, float x2, float y2) throws IOException {
        cs.setStrokingColor(color);
        cs.setLineWidth(BORDER_PT);
        cs.moveTo(x1, y1);
        cs.lineTo(x2, y2);
        cs.stroke();
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
