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
import org.apache.pdfbox.util.Matrix;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Renders text elements to PDF using Noto Sans JP for CJK support (issues #52/#56).
 *
 * <p>Supports multi-line wrapping, horizontal alignment, the vertical writing mode (縦書き, {@code
 * writingMode: "vertical-rl"}), furigana (ruby), and synthetic bold (stroke-widened glyphs, since
 * only a Regular CJK face is bundled). Reads the string as props.text → content → name and the
 * style from props or the V2 {@code style} object.
 */
public final class TextPdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(TextPdfRenderer.class);

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
                        10); // frontend DEFAULT_FONT_SIZE (#373)
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
        String verticalAlign =
                firstNonEmpty(
                        props != null ? textOf(props, "verticalAlign", "") : "",
                        style != null ? textOf(style, "verticalAlign", "") : "top");
        float lineHeight =
                firstNonZero(
                        style != null ? floatOf(style, "lineHeight", 0) : 0, DEFAULT_LINE_HEIGHT);
        // letterSpacing is em-based like the frontend (`${v}em` in TextContent, #319):
        // convert to points once so wrapping, alignment, and drawing all agree
        float letterSpacingEm =
                firstNonZero(
                        props != null ? floatOf(props, "letterSpacing", 0) : 0,
                        style != null ? floatOf(style, "letterSpacing", 0) : 0);
        float charSpacing = letterSpacingEm * fontSize;
        boolean vertical =
                "vertical-rl"
                        .equals(
                                firstNonEmpty(
                                        style != null ? textOf(style, "writingMode", "") : "",
                                        props != null ? textOf(props, "writingMode", "") : ""));

        // Text-style extras (#368): synthetic italic, underline/line-through, background fill
        boolean italic =
                "italic"
                        .equals(
                                firstNonEmpty(
                                        props != null ? textOf(props, "fontStyle", "") : "",
                                        style != null ? textOf(style, "fontStyle", "") : ""));
        String textDecoration =
                firstNonEmpty(
                        props != null ? textOf(props, "textDecoration", "") : "",
                        style != null ? textOf(style, "textDecoration", "") : "");
        String bgColorStr =
                firstNonEmpty(
                        props != null ? textOf(props, "backgroundColor", "") : "",
                        style != null ? textOf(style, "backgroundColor", "") : "");

        // Furigana (ruby)
        String furigana = textOf(el, "furigana", "");
        float furiScale = firstNonZero(floatOf(el, "furiganaScale", 0), 0.5f);

        cs.saveGraphicsState();
        try {
            // Background fills the element box (frontend applies style.backgroundColor to the text
            // div, which is 100% of the element) — drawn before the glyphs.
            Color bg = bgColorStr.isEmpty() ? null : parseColor(bgColorStr, null);
            if (bg != null) {
                cs.setNonStrokingColor(bg);
                cs.addRect(x, y - h, w, h);
                cs.fill();
            }
            configureBold(cs, syntheticBold, fontSize, color);
            if (vertical) {
                drawVertical(
                        cs,
                        font,
                        fontSize,
                        lineHeight,
                        text,
                        x,
                        y,
                        w,
                        h,
                        furigana,
                        furiScale,
                        charSpacing,
                        italic);
            } else {
                drawHorizontal(
                        cs,
                        font,
                        fontSize,
                        lineHeight,
                        text,
                        x,
                        y,
                        w,
                        h,
                        align,
                        verticalAlign,
                        furigana,
                        furiScale,
                        charSpacing,
                        italic,
                        textDecoration,
                        color);
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
            float h,
            String align,
            String verticalAlign,
            String furigana,
            float furiScale,
            float charSpacing,
            boolean italic,
            String textDecoration,
            Color color)
            throws IOException {
        boolean underline = textDecoration != null && textDecoration.contains("underline");
        boolean lineThrough =
                textDecoration != null
                        && (textDecoration.contains("line-through")
                                || textDecoration.contains("strikethrough"));
        float rubyH = furigana.isEmpty() ? 0 : fontSize * furiScale * 1.1f;
        List<String> lines = wrapText(text, font, fontSize, w, charSpacing);
        float lineStep = fontSize * lineHeight;
        // verticalAlign shifts the whole text block within the frame, mirroring the
        // frontend's flex justifyContent (toFlexAlign) — the block height is the CSS
        // line-box model: lines × (fontSize × lineHeight) plus the ruby band (#325)
        float blockH = rubyH + lines.size() * lineStep;
        float vOffset =
                switch (verticalAlign) {
                    case "middle", "center" -> Math.max(0, (h - blockH) / 2);
                    case "bottom", "end" -> Math.max(0, h - blockH);
                    default -> 0;
                };
        float cursorY = y - vOffset - rubyH - fontSize;
        for (String line : lines) {
            // CSS letter-spacing trails every glyph (incl. the last) and is part of
            // the line box, so alignment math includes the trailing spacing too
            float lineW =
                    strWidth(font, line, fontSize)
                            + line.codePointCount(0, line.length()) * charSpacing;
            float tx =
                    switch (align) {
                        case "center" -> x + (w - lineW) / 2;
                        case "right" -> x + w - lineW;
                        default -> x;
                    };
            showLine(cs, font, fontSize, line, tx, cursorY, charSpacing, italic);
            // Decoration rules (#368): underline below the baseline, line-through mid-glyph
            if ((underline || lineThrough) && !line.isEmpty()) {
                cs.setStrokingColor(color);
                cs.setLineWidth(Math.max(0.3f, fontSize * 0.06f));
                if (underline) {
                    float uy = cursorY - fontSize * 0.12f;
                    cs.moveTo(tx, uy);
                    cs.lineTo(tx + lineW, uy);
                    cs.stroke();
                }
                if (lineThrough) {
                    float sy = cursorY + fontSize * 0.30f;
                    cs.moveTo(tx, sy);
                    cs.lineTo(tx + lineW, sy);
                    cs.stroke();
                }
            }
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
            showLine(
                    cs,
                    font,
                    rubySize,
                    furigana,
                    blockX + (firstW - rubyW) / 2,
                    y - vOffset - rubySize);
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
            float furiScale,
            float charSpacing,
            boolean italic)
            throws IOException {
        // Columns fill top-to-bottom, advancing right-to-left from the frame's right edge.
        // letter-spacing extends the per-glyph advance along the vertical flow (#319).
        float glyphStep = fontSize + charSpacing;
        float colStep = fontSize * lineHeight;
        float colX = x + w - fontSize;
        float startY = y - fontSize;
        int maxPerCol = Math.max(1, (int) (h / glyphStep));

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
            showLine(
                    cs,
                    font,
                    fontSize,
                    ch,
                    colX + (fontSize - chW) / 2,
                    startY - row * glyphStep,
                    0f,
                    italic);
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
        showLine(cs, font, size, text, tx, baselineY, 0f, false);
    }

    private static void showLine(
            PDPageContentStream cs,
            PDFont font,
            float size,
            String text,
            float tx,
            float baselineY,
            float charSpacing)
            throws IOException {
        showLine(cs, font, size, text, tx, baselineY, charSpacing, false);
    }

    // Synthetic italic shear: ~12° slant applied via the text matrix (#368)
    private static final float ITALIC_SHEAR = 0.21f;

    private static void showLine(
            PDPageContentStream cs,
            PDFont font,
            float size,
            String text,
            float tx,
            float baselineY,
            float charSpacing,
            boolean italic)
            throws IOException {
        if (text.isEmpty()) return;
        FontGlyphs.SanitizeResult sanitized = FontGlyphs.sanitize(font, text);
        if (sanitized.hasDropped()) {
            // #329 Phase 5: surface missing glyphs instead of silently blanking them. The embedded
            // fonts cover Latin + Japanese; other scripts have no glyph and become whitespace.
            log.warn(
                    "PDF: embedded font cannot encode {} glyph(s); replaced with whitespace [{}]."
                            + " Report PDFs cover Latin + Japanese only; other scripts (Hangul,"
                            + " Simplified Chinese, Thai, …) are not rendered.",
                    sanitized.droppedCodePoints().size(),
                    FontGlyphs.summarize(sanitized.droppedCodePoints(), 10));
        }
        String safe = sanitized.text();
        cs.beginText();
        cs.setFont(font, size);
        if (charSpacing != 0) cs.setCharacterSpacing(charSpacing);
        if (italic) {
            // Shear the text space so glyphs slant right, then translate to (tx, baselineY).
            cs.setTextMatrix(new Matrix(1, 0, ITALIC_SHEAR, 1, tx, baselineY));
        } else {
            cs.newLineAtOffset(tx, baselineY);
        }
        cs.showText(safe);
        cs.endText();
        if (charSpacing != 0) cs.setCharacterSpacing(0);
    }

    private static float strWidth(PDFont font, String s, float size) {
        try {
            // Width of the drawable (sanitized) text; the draw path logs any dropped glyphs.
            return font.getStringWidth(FontGlyphs.sanitize(font, s).text()) / 1000 * size;
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
