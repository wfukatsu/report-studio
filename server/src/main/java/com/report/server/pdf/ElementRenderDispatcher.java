package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Single-element render dispatch: converts the element frame from mm to pt, resolves render-time
 * system values, and routes to the ElementPdfRendererRegistry. Extracted from SectionRenderHelper
 * (#276) — no behavior change.
 */
final class ElementRenderDispatcher {

    private static final Logger log = LoggerFactory.getLogger(SectionRenderHelper.class);

    private static final float MAX_DIMENSION_PT = 2000f;

    private static final ElementPdfRendererRegistry ELEMENT_REGISTRY =
            ElementPdfRendererRegistry.createDefault();

    private static final ElementPdfRenderer ELEMENT_FALLBACK =
            new ElementPdfRenderer() {
                @Override
                public String kind() {
                    return "__fallback__";
                }

                @Override
                public void render(
                        org.apache.pdfbox.pdmodel.PDPageContentStream cs,
                        JsonNode el,
                        float x,
                        float y,
                        float w,
                        float h,
                        float pageHeight,
                        org.apache.pdfbox.pdmodel.PDDocument doc,
                        java.util.Map<String, org.apache.pdfbox.pdmodel.font.PDFont> fontCache)
                        throws java.io.IOException {
                    PdfUtils.renderBorder(cs, x, y, w, h);
                }
            };

    private ElementRenderDispatcher() {}

    /** Render a single element via the ElementPdfRendererRegistry. */
    static void renderElement(PageContext ctx, JsonNode el) {
        try {
            // Page numbers / print dates are only known now (issue #54)
            el = RenderTimeSystemValues.resolveSystemValues(el, ctx);

            // V1 uses "kind"; V2 uses "type" — resolveKind falls back to "type"
            String kind = ElementNodeSupport.resolveKind(el);

            // V1 uses "frame" { x, y, width, height }; V2 uses "position" + "size"
            float xMm, yMm, wMm, hMm;
            JsonNode frame = el.get("frame");
            if (frame != null) {
                xMm = PdfUtils.floatOf(frame, "x");
                yMm = PdfUtils.floatOf(frame, "y");
                wMm = PdfUtils.floatOf(frame, "width");
                hMm = PdfUtils.floatOf(frame, "height");
            } else {
                JsonNode position = el.get("position");
                JsonNode size = el.get("size");
                if (position == null || size == null) return;
                xMm = PdfUtils.floatOf(position, "x");
                yMm = PdfUtils.floatOf(position, "y");
                wMm = PdfUtils.floatOf(size, "width");
                hMm = PdfUtils.floatOf(size, "height");
            }

            // Element Y is section-relative on the frontend; add the section's cumulative top
            // (sum of preceding section heights) so stacked sections don't overlap (#354).
            float x = xMm * SectionRenderHelper.MM_TO_PT;
            float y =
                    ctx.pageHeight()
                            - ((yMm + ctx.sectionYOffsetMm()) * SectionRenderHelper.MM_TO_PT);
            float w = Math.min(wMm * SectionRenderHelper.MM_TO_PT, MAX_DIMENSION_PT);
            float h = Math.min(hMm * SectionRenderHelper.MM_TO_PT, MAX_DIMENSION_PT);
            ELEMENT_REGISTRY
                    .get(kind)
                    .orElse(ELEMENT_FALLBACK)
                    .render(
                            ctx.contentStream(),
                            el,
                            x,
                            y,
                            w,
                            h,
                            ctx.pageHeight(),
                            ctx.document(),
                            ctx.fontCache());
        } catch (Exception e) {
            log.warn(
                    "Failed to render element {}: {}",
                    PdfUtils.textOf(el, "id", "?"),
                    e.getMessage());
        }
    }
}
