package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renderer for elements whose value is resolved upstream into {@code props.text} — V2 {@code
 * pageNumber} / {@code currentDate} (issue #54) and the {@code tenant*} text elements, whose values
 * SectionRenderHelper computes before dispatch.
 *
 * <p>These carry the same {@code props.text} + {@code style} shape as the {@code text} element, so
 * this delegates rendering to {@link TextPdfRenderer} (#365). That closes a path asymmetry: the old
 * bespoke draw loop only did fontSize/bold/fontFamily/color/textAlign and dropped writingMode
 * (縦書き), letterSpacing, verticalAlign, lineHeight, and multi-line wrapping — all already supported
 * by {@code text}. Sharing one path keeps the two in lock-step going forward.
 */
public final class StyledTextPdfRenderer implements ElementPdfRenderer {

    private static final TextPdfRenderer DELEGATE = new TextPdfRenderer();

    private final String elementKind;

    public StyledTextPdfRenderer(String kind) {
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
        DELEGATE.render(cs, el, x, y, w, h, pageHeight, doc, fontCache);
    }
}
