package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/** Renders check-related elements (check_mark, checkbox, radio_mark) to PDF. */
public final class CheckPdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;
    private static final float CHECKBOX_BORDER_PT = 0.3f * MM_TO_PT; // front DEFAULT_BORDER_WIDTH
    private static final float LABEL_GAP_PT = 1f * MM_TO_PT; // front flex gap
    private static final float LABEL_FONT_PT = 2.8f * MM_TO_PT; // front label fontSize 2.8mm

    private final String elementKind;

    public CheckPdfRenderer(String kind) {
        this.elementKind = kind;
    }

    @Override
    public String kind() {
        return elementKind;
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
        cs.saveGraphicsState();
        switch (elementKind) {
            case "check_mark" -> renderCheckMark(cs, el, x, y, w, h, doc, fontCache);
            case "checkbox" -> renderCheckbox(cs, el, x, y, w, h, doc, fontCache);
            case "radio_mark" -> renderRadioMark(cs, el, x, y, w, h);
        }
        cs.restoreGraphicsState();
    }

    private void renderCheckMark(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        PDFont font = FontProvider.getFont(doc, fontCache);
        float fontSize = Math.min(w, h) * 0.8f;
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(Color.BLACK);
        float textX = x + (w - fontSize * 0.6f) / 2;
        float textY = y - h + (h - fontSize) / 2;
        cs.newLineAtOffset(textX, textY);
        cs.showText("\u2713"); // ✓
        cs.endText();
    }

    /**
     * Renders a checkbox to match the frontend {@code CheckboxRenderer} (#356): a square box (side
     * = element height, front {@code size.height}), a {@code checkmark} glyph (not a fixed path),
     * an optional {@code label} placed per {@code labelPosition} (right/left/top/bottom), and a
     * checked state resolved as {@code dataSource ? resolved : el.checked}.
     */
    private static void renderCheckbox(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        String labelPos = elementTextOf(el, "labelPosition", "right");
        String label = elementTextOf(el, "label", "");
        String checkmark = elementTextOf(el, "checkmark", "✓");
        boolean checked = resolveChecked(el);
        Color checkColor = parseColor(styleColor(el), Color.BLACK);

        // Square box; front uses size.height for both sides. Cap to width for degenerate frames.
        float boxSide = Math.min(h, w);

        // Box position: label placement decides where the box sits within the frame.
        float boxX;
        float boxTopY; // top edge in PDF coords (y grows up)
        switch (labelPos) {
            case "left" -> {
                boxX = x + w - boxSide;
                boxTopY = y - (h - boxSide) / 2f;
            }
            case "top" -> {
                boxX = x + (w - boxSide) / 2f;
                boxTopY = y - Math.max(0f, h - boxSide);
            }
            case "bottom" -> {
                boxX = x + (w - boxSide) / 2f;
                boxTopY = y;
            }
            default -> { // right
                boxX = x;
                boxTopY = y - (h - boxSide) / 2f;
            }
        }

        // Box outline (0.3mm border, front DEFAULT_BORDER_WIDTH)
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(CHECKBOX_BORDER_PT);
        cs.addRect(boxX, boxTopY - boxSide, boxSide, boxSide);
        cs.stroke();

        PDFont font = FontProvider.getFont(doc, fontCache);

        // Checkmark glyph, centered in the box (front fontSize = size.height * 0.6)
        if (checked && !checkmark.isEmpty()) {
            float glyphSize = boxSide * 0.6f;
            float gW = estimateWidth(font, checkmark, glyphSize);
            float gx = boxX + (boxSide - gW) / 2f;
            float gy = boxTopY - boxSide + (boxSide - glyphSize) / 2f + glyphSize * 0.12f;
            cs.beginText();
            cs.setFont(font, glyphSize);
            cs.setNonStrokingColor(checkColor);
            cs.newLineAtOffset(gx, gy);
            cs.showText(checkmark);
            cs.endText();
        }

        // Label text (front hides it when empty)
        if (!label.isEmpty()) {
            float boxMidY = boxTopY - boxSide / 2f;
            float lx;
            float ly;
            switch (labelPos) {
                case "left" -> {
                    lx = boxX - LABEL_GAP_PT - estimateWidth(font, label, LABEL_FONT_PT);
                    ly = boxMidY - LABEL_FONT_PT * 0.35f;
                }
                case "top" -> {
                    lx = x;
                    ly = y - LABEL_FONT_PT;
                }
                case "bottom" -> {
                    lx = x;
                    ly = boxTopY - boxSide - LABEL_GAP_PT - LABEL_FONT_PT;
                }
                default -> { // right
                    lx = boxX + boxSide + LABEL_GAP_PT;
                    ly = boxMidY - LABEL_FONT_PT * 0.35f;
                }
            }
            cs.beginText();
            cs.setFont(font, LABEL_FONT_PT);
            cs.setNonStrokingColor(Color.BLACK);
            cs.newLineAtOffset(lx, ly);
            cs.showText(label);
            cs.endText();
        }
    }

    /**
     * Checked state, mirroring the frontend {@code el.dataSource ? resolved !== '' : el.checked}. A
     * binding-resolved value lands in {@code props.checked} (any non-empty/true/non-zero →
     * checked); otherwise a static top-level {@code checked} is used. A dataSource with no resolved
     * value is unchecked, matching the frontend's empty resolved value.
     */
    private static boolean resolveChecked(JsonNode el) {
        JsonNode props = el.get("props");
        if (props != null && props.has("checked")) {
            JsonNode c = props.get("checked");
            if (c.isBoolean()) return c.booleanValue();
            if (c.isNumber()) return c.doubleValue() != 0;
            return !c.asText("").isEmpty();
        }
        if (!elementTextOf(el, "dataSource", "").isEmpty()) return false;
        return el.path("checked").asBoolean(false);
    }

    /** {@code style.color} of the element (top level or props), or empty if unset. */
    private static String styleColor(JsonNode el) {
        JsonNode style = el.has("style") ? el.get("style") : null;
        if (style == null) {
            JsonNode props = el.get("props");
            style = props != null ? props.get("style") : null;
        }
        return style != null ? textOf(style, "color", "") : "";
    }

    private static float estimateWidth(PDFont font, String text, float fontSize) {
        try {
            return font.getStringWidth(text) / 1000f * fontSize;
        } catch (IOException e) {
            return text.length() * fontSize * 0.5f;
        }
    }

    private static void renderRadioMark(
            PDPageContentStream cs, JsonNode el, float x, float y, float w, float h)
            throws IOException {
        float cx = x + w / 2;
        float cy = y - h / 2;
        float r = Math.min(w, h) / 2;

        // Outer circle
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(1);
        drawCircle(cs, cx, cy, r);
        cs.stroke();

        // If selected, fill inner circle
        JsonNode props = el.get("props");
        boolean selected =
                props != null && props.has("selected") && props.get("selected").asBoolean(false);
        if (selected) {
            cs.setNonStrokingColor(Color.BLACK);
            drawCircle(cs, cx, cy, r * 0.5f);
            cs.fill();
        }
    }

    private static void drawCircle(PDPageContentStream cs, float cx, float cy, float r)
            throws IOException {
        float k = 0.5522848f * r;
        cs.moveTo(cx - r, cy);
        cs.curveTo(cx - r, cy + k, cx - k, cy + r, cx, cy + r);
        cs.curveTo(cx + k, cy + r, cx + r, cy + k, cx + r, cy);
        cs.curveTo(cx + r, cy - k, cx + k, cy - r, cx, cy - r);
        cs.curveTo(cx - k, cy - r, cx - r, cy - k, cx - r, cy);
        cs.closePath();
    }
}
