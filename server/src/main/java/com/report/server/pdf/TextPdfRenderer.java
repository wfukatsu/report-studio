package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders text elements to PDF using Noto Sans JP for CJK support (issues #52/#56).
 *
 * <p>Supports multi-line wrapping, horizontal alignment, the vertical writing mode (縦書き, {@code
 * writingMode: "vertical-rl"}), furigana (ruby), and synthetic bold (stroke-widened glyphs, since
 * only a Regular CJK face is bundled). Reads the string as props.text → content → name and the
 * style from props or the V2 {@code style} object.
 */
public final class TextPdfRenderer implements ElementPdfRenderer {

    private static final float DEFAULT_LINE_HEIGHT = 1.4f;

    @Override
    public String kind() {
        return "text";
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
        String text = props != null ? textOf(props, "text", "") : "";
        if (text.isEmpty()) text = textOf(el, "content", "");
        if (text.isEmpty()) text = textOf(el, "name", "");
        if (text.isEmpty()) return;

        JsonNode style = el.get("style");
        float fontSize =
                firstNonZero(
                        props != null ? floatOf(props, "fontSize", 0) : 0,
                        style != null ? floatOf(style, "fontSize", 0) : 0,
                        12);
        boolean bold = isBold(props) || isBold(style);
        String fontFamily =
                firstNonEmpty(
                        props != null ? textOf(props, "fontFamily", "") : "",
                        style != null ? textOf(style, "fontFamily", "") : "");
        // Real bold face when available; synthetic stroke only as a fallback (issue #56)
        PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);
        boolean syntheticBold = FontProvider.isSyntheticBold(fontFamily, bold);
        Color color =
                parseColor(
                        firstNonEmpty(
                                props != null ? textOf(props, "color", "") : "",
                                style != null ? textOf(style, "color", "") : ""),
                        Color.BLACK);
        String align =
                firstNonEmpty(
                        props != null ? textOf(props, "textAlign", "") : "",
                        style != null ? textOf(style, "textAlign", "") : "left");
        float lineHeight =
                firstNonZero(
                        style != null ? floatOf(style, "lineHeight", 0) : 0, DEFAULT_LINE_HEIGHT);
        boolean vertical =
                "vertical-rl"
                        .equals(
                                firstNonEmpty(
                                        style != null ? textOf(style, "writingMode", "") : "",
                                        props != null ? textOf(props, "writingMode", "") : ""));

        // Furigana (ruby)
        String furigana = textOf(el, "furigana", "");
        float furiScale = firstNonZero(floatOf(el, "furiganaScale", 0), 0.5f);

        cs.saveGraphicsState();
        try {
            configureBold(cs, syntheticBold, fontSize, color);
            if (vertical) {
                drawVertical(cs, font, fontSize, lineHeight, text, x, y, w, h, furigana, furiScale);
            } else {
                drawHorizontal(
                        cs, font, fontSize, lineHeight, text, x, y, w, align, furigana, furiScale);
            }
        } finally {
            cs.restoreGraphicsState();
        }
    }

    // ── Horizontal ──────────────────────────────────────────────────────

    private static void drawHorizontal(
            PDPageContentStream cs,
            PDFont font,
            float fontSize,
            float lineHeight,
            String text,
            float x,
            float y,
            float w,
            String align,
            String furigana,
            float furiScale)
            throws IOException {
        float rubyH = furigana.isEmpty() ? 0 : fontSize * furiScale * 1.1f;
        List<String> lines = wrapText(text, font, fontSize, w);
        float lineStep = fontSize * lineHeight;
        float cursorY = y - rubyH - fontSize;
        for (String line : lines) {
            float lineW = strWidth(font, line, fontSize);
            float tx =
                    switch (align) {
                        case "center" -> x + (w - lineW) / 2;
                        case "right" -> x + w - lineW;
                        default -> x;
                    };
            showLine(cs, font, fontSize, line, tx, cursorY);
            cursorY -= lineStep;
        }
        // Ruby over the first line, centered on the text block
        if (!furigana.isEmpty()) {
            float rubySize = fontSize * furiScale;
            float firstW = strWidth(font, lines.isEmpty() ? "" : lines.get(0), fontSize);
            float blockX =
                    switch (align) {
                        case "center" -> x + (w - firstW) / 2;
                        case "right" -> x + w - firstW;
                        default -> x;
                    };
            float rubyW = strWidth(font, furigana, rubySize);
            showLine(cs, font, rubySize, furigana, blockX + (firstW - rubyW) / 2, y - rubySize);
        }
    }

    // ── Vertical (縦書き) ────────────────────────────────────────────────

    private static void drawVertical(
            PDPageContentStream cs,
            PDFont font,
            float fontSize,
            float lineHeight,
            String text,
            float x,
            float y,
            float w,
            float h,
            String furigana,
            float furiScale)
            throws IOException {
        // Columns fill top-to-bottom, advancing right-to-left from the frame's right edge.
        float colStep = fontSize * lineHeight;
        float colX = x + w - fontSize;
        float startY = y - fontSize;
        int maxPerCol = Math.max(1, (int) ((h) / fontSize));

        int[] cps = text.codePoints().toArray();
        int row = 0;
        for (int i = 0; i < cps.length; i++) {
            int cp = cps[i];
            if (cp == '\n') {
                colX -= colStep;
                row = 0;
                continue;
            }
            if (row >= maxPerCol) {
                colX -= colStep;
                row = 0;
            }
            if (colX < x) break; // out of horizontal space
            String ch = new String(Character.toChars(cp));
            float chW = strWidth(font, ch, fontSize);
            showLine(cs, font, fontSize, ch, colX + (fontSize - chW) / 2, startY - row * fontSize);
            row++;
        }
        // Ruby to the right of the first column
        if (!furigana.isEmpty()) {
            float rubySize = fontSize * furiScale;
            int[] rcps = furigana.codePoints().toArray();
            float rx = x + w - fontSize + fontSize; // just right of the first column
            for (int i = 0; i < rcps.length; i++) {
                String ch = new String(Character.toChars(rcps[i]));
                showLine(cs, font, rubySize, ch, rx, startY - i * rubySize);
            }
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /** Synthetic bold: widen glyph outlines by stroking in the fill color. */
    private static void configureBold(
            PDPageContentStream cs, boolean bold, float fontSize, Color color) throws IOException {
        if (bold) {
            cs.setRenderingMode(org.apache.pdfbox.pdmodel.graphics.state.RenderingMode.FILL_STROKE);
            cs.setLineWidth(fontSize * 0.03f);
            cs.setStrokingColor(color);
        }
        cs.setNonStrokingColor(color);
    }

    private static void showLine(
            PDPageContentStream cs, PDFont font, float size, String text, float tx, float baselineY)
            throws IOException {
        if (text.isEmpty()) return;
        String safe = sanitizeForFont(font, text);
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(tx, baselineY);
        cs.showText(safe);
        cs.endText();
    }

    /** Drop code points the font cannot encode, so showText never throws mid-render. */
    private static String sanitizeForFont(PDFont font, String text) {
        try {
            font.getStringWidth(text);
            return text;
        } catch (Exception e) {
            StringBuilder sb = new StringBuilder();
            text.codePoints()
                    .forEach(
                            cp -> {
                                String ch = new String(Character.toChars(cp));
                                try {
                                    font.getStringWidth(ch);
                                    sb.append(ch);
                                } catch (Exception ignored) {
                                    sb.append(' ');
                                }
                            });
            return sb.toString();
        }
    }

    private static float strWidth(PDFont font, String s, float size) {
        try {
            return font.getStringWidth(sanitizeForFont(font, s)) / 1000 * size;
        } catch (Exception e) {
            return s.length() * size;
        }
    }

    private static float firstNonZero(float a, float b) {
        return a != 0 ? a : b;
    }

    private static float firstNonZero(float a, float b, float c) {
        return a != 0 ? a : (b != 0 ? b : c);
    }

    private static String firstNonEmpty(String a, String b) {
        return !a.isEmpty() ? a : b;
    }
}
