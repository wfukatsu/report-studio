package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders standalone V2 {@code eraSelect} (元号選択) elements to PDF (issue #53; the formTable-cell
 * variant lives in FormTablePdfRenderer).
 *
 * <p>Mirrors the frontend EraSelectRenderer: era markers (●selected / ○unselected) laid out in a
 * column, row, or 2-column grid with the same auto font-size ratios. The selected era arrives via
 * {@code props.text} (resolved upstream from the element's {@code dataSource} field by
 * SectionRenderHelper); empty means no selection — all ○.
 */
public final class EraSelectPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = SectionRenderHelper.MM_TO_PT;
    private static final String[] DEFAULT_ERAS = {"明", "大", "昭", "平", "令"};
    private static final float MIN_FONT_PT = 2.0f * MM_TO_PT;

    @Override
    public String kind() {
        return "eraSelect";
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
        JsonNode props = el.get("props");
        String selected = props != null ? textOf(props, "text", "") : "";

        List<String> eras = readEras(el);
        String layout = elementTextOf(el, "layout", "column");
        int count = Math.max(eras.size(), 1);

        // Frontend auto font-size ratios (mm-space, then to pt)
        float rawFontPt =
                switch (layout) {
                    case "row" -> (w / count) * 0.5f;
                    case "grid-2col" -> (h / (float) Math.ceil(count / 2.0)) * 0.6f;
                    default -> (h / count) * 0.75f;
                };
        float fontSize = Math.max(rawFontPt, MIN_FONT_PT);
        PDFont font = FontProvider.getFont(doc, fontCache);

        cs.saveGraphicsState();
        try {
            cs.setNonStrokingColor(Color.BLACK);
            for (int i = 0; i < eras.size(); i++) {
                String era = eras.get(i);
                String marker = era.equals(selected) ? "●" : "○";
                float itemX;
                float centerY;
                switch (layout) {
                    case "row" -> {
                        float slotW = w / count;
                        itemX = x + slotW * i + slotW * 0.05f;
                        centerY = y - h / 2;
                    }
                    case "grid-2col" -> {
                        int rows = (int) Math.ceil(count / 2.0);
                        float slotH = h / rows;
                        itemX = x + (i % 2) * (w / 2);
                        centerY = y - slotH * (i / 2) - slotH / 2;
                    }
                    default -> { // column
                        float slotH = h / count;
                        itemX = x;
                        centerY = y - slotH * i - slotH / 2;
                    }
                }
                // Frontend draws the marker and era in a flex row with a 0.3mm gap (#373),
                // not a single concatenated glyph run.
                float baselineY = centerY - fontSize * 0.35f;
                cs.beginText();
                cs.setFont(font, fontSize);
                cs.newLineAtOffset(itemX, baselineY);
                cs.showText(marker);
                cs.endText();

                float markerW = font.getStringWidth(marker) / 1000 * fontSize;
                float eraX = itemX + markerW + 0.3f * MM_TO_PT;
                cs.beginText();
                cs.setFont(font, fontSize);
                cs.newLineAtOffset(eraX, baselineY);
                cs.showText(era);
                cs.endText();
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    private static List<String> readEras(JsonNode el) {
        JsonNode erasNode = el.get("eras");
        if (erasNode == null || !erasNode.isArray()) {
            JsonNode props = el.get("props");
            erasNode = props != null ? props.get("eras") : null;
        }
        List<String> eras = new ArrayList<>();
        if (erasNode != null && erasNode.isArray()) {
            erasNode.forEach(n -> eras.add(n.asText()));
        }
        if (eras.isEmpty()) eras.addAll(List.of(DEFAULT_ERAS));
        return eras;
    }
}
