package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.report.server.ValueFormatter;
import java.awt.Color;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders V2 {@code dataField} elements to PDF (issue #53).
 *
 * <p>The bound value arrives via {@code props.text} (resolved upstream from the element's {@code
 * fieldKey} by SectionRenderHelper), then the element's {@code format} ({@code CalculationFormat})
 * is applied through {@link ValueFormatter} — the server port of src/lib/numberFormatter.ts. Empty
 * values fall back to {@code fallbackText} (blank when absent; the designer-only gray label
 * placeholder is intentionally not reproduced).
 *
 * <p>Style support ({@code TextStyle} subset): fontSize (pt), bold, fontFamily (serif/mincho
 * switch), color, textAlign (left/center/right), verticalAlign, lineHeight, letterSpacing. Layout
 * mirrors the frontend {@code TextContent} (#364): the value <em>wraps</em> to multiple lines
 * within the frame (previously single-line truncation), {@code padding*} shrinks the text area, and
 * {@code textFit} either shrinks the font to fit ({@code shrinkText}) or renders all lines
 * regardless of height ({@code expandFrame}).
 */
public final class DataFieldPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_FONT_SIZE = 10f; // frontend DEFAULT_FONT_SIZE (#373)
    private static final float DEFAULT_LINE_HEIGHT = 1.4f;
    private static final float MM_TO_PT = PdfUnits.MM_TO_PT;

    // shrinkText binary search — mirrors the frontend constants.ts values
    private static final float MIN_SHRINK_FONT_SIZE_PT = 1f;
    private static final int SHRINK_MAX_ITERATIONS = 20;
    private static final float SHRINK_CONVERGENCE_PT = 0.05f;
    private static final float OVERFLOW_TOLERANCE_PT = 0.75f; // ≈1px

    @Override
    public String kind() {
        return "dataField";
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
        String raw = props != null ? textOf(props, "text", "") : "";
        String text;
        if (raw.isEmpty()) {
            text = elementTextOf(el, "fallbackText", "");
        } else {
            JsonNode format = el.get("format");
            if (format == null && props != null) format = props.get("format");
            text =
                    ValueFormatter.applyFormat(
                            props != null && props.has("text")
                                    ? props.get("text")
                                    : el.path("text"),
                            format);
        }
        if (text.isEmpty()) return;

        JsonNode style = el.get("style");
        if (style == null && props != null) style = props.get("style");
        float baseFontSize =
                style != null ? floatOf(style, "fontSize", DEFAULT_FONT_SIZE) : DEFAULT_FONT_SIZE;
        boolean bold = isBold(style);
        String fontFamily = style != null ? textOf(style, "fontFamily", "") : "";
        String textAlign = style != null ? textOf(style, "textAlign", "left") : "left";
        String verticalAlign = style != null ? textOf(style, "verticalAlign", "top") : "top";
        float lineHeight =
                style != null && floatOf(style, "lineHeight", 0) != 0
                        ? floatOf(style, "lineHeight", 0)
                        : DEFAULT_LINE_HEIGHT;
        Color color = parseColor(style != null ? textOf(style, "color", "") : "", Color.BLACK);
        float letterSpacingEm = style != null ? floatOf(style, "letterSpacing", 0) : 0;
        String textFit = style != null ? textOf(style, "textFit", "") : "";

        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);

        // padding (mm) shrinks the text area, mirroring the frontend inner box (#364)
        float padTop = padPt(style, "paddingTop");
        float padRight = padPt(style, "paddingRight");
        float padBottom = padPt(style, "paddingBottom");
        float padLeft = padPt(style, "paddingLeft");
        float innerX = x + padLeft;
        float innerTopY = y - padTop;
        float innerW = w - padLeft - padRight;
        float innerH = h - padTop - padBottom;
        if (innerW <= 0) return;

        boolean expand = "expandFrame".equals(textFit);
        float fontSize = baseFontSize;
        if ("shrinkText".equals(textFit)) {
            fontSize =
                    shrinkToFit(
                            text, font, baseFontSize, innerW, innerH, lineHeight, letterSpacingEm);
        }

        // em-based letter spacing, same semantics as TextContent/TextPdfRenderer (#319)
        float charSpacing = letterSpacingEm * fontSize;
        List<String> lines = wrapText(text, font, fontSize, innerW, charSpacing);

        float lineStep = fontSize * lineHeight;
        float blockH = lines.size() * lineStep;
        // verticalAlign shifts the wrapped block within the frame (frontend flex justifyContent).
        // expandFrame grows downward from the top, so it is always top-anchored.
        float vOffset =
                expand
                        ? 0
                        : switch (verticalAlign) {
                            case "middle", "center" -> Math.max(0, (innerH - blockH) / 2);
                            case "bottom", "end" -> Math.max(0, innerH - blockH);
                            default -> 0;
                        };

        cs.setNonStrokingColor(color);
        if (charSpacing != 0) cs.setCharacterSpacing(charSpacing);
        float cursorY = innerTopY - vOffset - fontSize;
        for (String line : lines) {
            float lineW =
                    font.getStringWidth(line) / 1000 * fontSize
                            + line.codePointCount(0, line.length()) * charSpacing;
            float tx =
                    switch (textAlign) {
                        case "center" -> innerX + Math.max(0, (innerW - lineW) / 2);
                        case "right" -> innerX + Math.max(0, innerW - lineW);
                        default -> innerX;
                    };
            cs.beginText();
            cs.setFont(font, fontSize);
            cs.newLineAtOffset(tx, cursorY);
            cs.showText(line);
            cs.endText();
            cursorY -= lineStep;
        }
        if (charSpacing != 0) cs.setCharacterSpacing(0);
    }

    /** Padding value (mm → pt) from the style node; 0 when unset. */
    private static float padPt(JsonNode style, String key) {
        return (style != null ? floatOf(style, key, 0) : 0) * MM_TO_PT;
    }

    /**
     * Largest font size in [{@link #MIN_SHRINK_FONT_SIZE_PT}, base] whose wrapped block fits {@code
     * innerH}, by binary search — mirrors the frontend shrinkText loop. Width always fits because
     * wrapping targets {@code innerW}.
     */
    private static float shrinkToFit(
            String text,
            PDFont font,
            float base,
            float innerW,
            float innerH,
            float lineHeight,
            float letterSpacingEm) {
        if (fits(text, font, base, innerW, innerH, lineHeight, letterSpacingEm)) return base;
        float lo = MIN_SHRINK_FONT_SIZE_PT;
        float hi = base;
        for (int i = 0; i < SHRINK_MAX_ITERATIONS && hi - lo > SHRINK_CONVERGENCE_PT; i++) {
            float mid = (lo + hi) / 2;
            if (fits(text, font, mid, innerW, innerH, lineHeight, letterSpacingEm)) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    private static boolean fits(
            String text,
            PDFont font,
            float fontSize,
            float innerW,
            float innerH,
            float lineHeight,
            float letterSpacingEm) {
        float charSpacing = letterSpacingEm * fontSize;
        List<String> lines = wrapText(text, font, fontSize, innerW, charSpacing);
        float blockH = lines.size() * fontSize * lineHeight;
        return blockH <= innerH + OVERFLOW_TOLERANCE_PT;
    }
}
