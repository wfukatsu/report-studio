package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.ConditionEvaluator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Shared element-rendering utilities for SectionPdfRenderer implementations.
 *
 * <p>Holds the ElementPdfRendererRegistry instance and coordinate conversion
 * constants. Section renderers call these methods rather than duplicating the
 * mm→pt conversion and registry lookup logic.
 */
public final class SectionRenderHelper {

    private static final Logger log = LoggerFactory.getLogger(SectionRenderHelper.class);

    public static final float MM_TO_PT = 2.835f;
    private static final float MAX_DIMENSION_PT = 2000f;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final ElementPdfRendererRegistry ELEMENT_REGISTRY =
            ElementPdfRendererRegistry.createDefault();

    private static final ElementPdfRenderer ELEMENT_FALLBACK = new ElementPdfRenderer() {
        @Override public String kind() { return "__fallback__"; }
        @Override public void render(
                org.apache.pdfbox.pdmodel.PDPageContentStream cs, JsonNode el,
                float x, float y, float w, float h, float pageHeight,
                org.apache.pdfbox.pdmodel.PDDocument doc,
                java.util.Map<String, org.apache.pdfbox.pdmodel.font.PDFont> fontCache)
                throws java.io.IOException {
            PdfUtils.renderBorder(cs, x, y, w, h);
        }
    };

    private SectionRenderHelper() {}

    // ── Element rendering ───────────────────────────────────────────────

    /**
     * Render all elements in a section, applying conditional display and scalar formData bindings.
     * Row-indexed bindings (bindingRef containing "[]") are not resolved here — use
     * {@link #renderElementsForRow} for detail/multi-row sections.
     *
     * <p>If the section has {@code layoutMode: "relative"}, element Y positions are
     * pre-computed via {@link RelativeLayoutResolver} before rendering.
     */
    public static void renderElements(PageContext ctx, JsonNode section, JsonNode formData) {
        renderElements(ctx, section, formData, VariantContext.empty());
    }

    /**
     * Render all elements with variant-aware visibility and masking.
     */
    public static void renderElements(PageContext ctx, JsonNode section, JsonNode formData,
                                      VariantContext variantCtx) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;

        boolean isRelative = "relative".equals(PdfUtils.textOf(section, "layoutMode", "absolute"));
        Map<String, Float> effectiveY = isRelative
                ? RelativeLayoutResolver.resolveEffectiveY(elements) : Map.of();

        for (JsonNode el : elements) {
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, 0)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode withLayout = isRelative ? RelativeLayoutResolver.applyEffectiveY(el, effectiveY) : el;
            JsonNode resolved = formData != null ? resolveFormData(withLayout, formData) : withLayout;
            JsonNode masked = applyMaskingToElement(resolved, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /**
     * Render all non-row-block elements (header/footer of a table section).
     * Used to render column headers and section-level decorations.
     */
    public static void renderNonRowElements(PageContext ctx, JsonNode section, JsonNode formData) {
        renderNonRowElements(ctx, section, formData, VariantContext.empty());
    }

    /**
     * Render all non-row-block elements with variant-aware masking.
     */
    public static void renderNonRowElements(PageContext ctx, JsonNode section, JsonNode formData,
                                            VariantContext variantCtx) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if ("row_block".equals(resolveKind(el))) continue;
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode resolved = formData != null ? resolveFormData(el, formData) : el;
            JsonNode masked = applyMaskingToElement(resolved, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /**
     * Render a single row_block element with data from a specific logical row index.
     *
     * @param ctx        page context
     * @param el         row_block element JSON node
     * @param formData   form data
     * @param rowIdx     zero-based logical row index
     * @param rowsPerPage rows per page (used for Y-offset calculation within page)
     */
    public static void renderElementsForRow(PageContext ctx, JsonNode section,
                                            JsonNode formData, int rowIdx, int rowsPerPage) {
        renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage, VariantContext.empty());
    }

    /**
     * Render row_block elements with variant-aware visibility and masking.
     * The row stride defaults to each element's own frame height.
     */
    public static void renderElementsForRow(PageContext ctx, JsonNode section,
                                            JsonNode formData, int rowIdx, int rowsPerPage,
                                            VariantContext variantCtx) {
        renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage, variantCtx, Float.NaN);
    }

    /**
     * Render row_block elements with an explicit row-unit stride (mm).
     * Multi-row units must advance by the whole unit's extent, not each
     * element's own height (issue #55).
     */
    public static void renderElementsForRow(PageContext ctx, JsonNode section,
                                            JsonNode formData, int rowIdx, int rowsPerPage,
                                            VariantContext variantCtx, float strideMm) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!"row_block".equals(resolveKind(el))) continue;
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, rowIdx)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode rowEl = resolveDetailRow(el, formData, rowIdx, rowsPerPage, strideMm);
            JsonNode masked = applyMaskingToElement(rowEl, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /** Render a single element via the ElementPdfRendererRegistry. */
    public static void renderElement(PageContext ctx, JsonNode el) {
        try {
            // Page numbers / print dates are only known now (issue #54)
            el = resolveSystemValues(el, ctx);

            // V1 uses "kind"; V2 uses "type" — resolveKind falls back to "type"
            String kind = resolveKind(el);

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

            float x = xMm * MM_TO_PT;
            float y = ctx.pageHeight() - (yMm * MM_TO_PT);
            float w = Math.min(wMm * MM_TO_PT, MAX_DIMENSION_PT);
            float h = Math.min(hMm * MM_TO_PT, MAX_DIMENSION_PT);
            ELEMENT_REGISTRY.get(kind)
                    .orElse(ELEMENT_FALLBACK)
                    .render(ctx.contentStream(), el, x, y, w, h,
                            ctx.pageHeight(), ctx.document(), ctx.fontCache());
        } catch (Exception e) {
            log.warn("Failed to render element {}: {}",
                    PdfUtils.textOf(el, "id", "?"), e.getMessage());
        }
    }

    // ── Form data resolution ────────────────────────────────────────────

    /**
     * Resolve scalar form data bindings into element props.
     * Master fields: "group.field" → _formData["group.field"]
     * Detail fields (first row only): "group[].field" → _formData.group[0].field
     */
    public static JsonNode resolveFormData(JsonNode el, JsonNode formData) {
        String ref = resolveBindingRef(el);
        if (ref == null) return el;
        if (ref.startsWith("{")) return el; // system variable — resolved at render time

        JsonNode value = null;
        if (ref.contains("[]")) {
            String[] parts = ref.split("\\[\\]\\.");
            if (parts.length == 2) {
                JsonNode group = formData.get(parts[0]);
                if (group != null && group.isArray() && !group.isEmpty()) {
                    value = group.get(0).get(parts[1]);
                }
            }
        } else {
            value = formData.get(ref);
        }

        if (value == null) return el;
        return withResolvedProp(el, value);
    }

    /**
     * Create a copy of a row element with data from the given logical row index.
     * The element Y position is offset by {@code (rowIdx % rowsPerPage) * rowHeight}.
     */
    public static JsonNode resolveDetailRow(JsonNode el, JsonNode formData,
                                            int rowIdx, int rowsPerPage) {
        return resolveDetailRow(el, formData, rowIdx, rowsPerPage, Float.NaN);
    }

    /**
     * Stride-aware variant: the Y offset per logical row is {@code strideMm}
     * (the row unit's full extent); NaN falls back to the element's own height.
     */
    public static JsonNode resolveDetailRow(JsonNode el, JsonNode formData,
                                            int rowIdx, int rowsPerPage, float strideMm) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode == null || !bindingRefNode.isTextual() || formData == null) return el;
        String ref = bindingRefNode.asText();
        if (!ref.contains("[]")) return el;

        String[] parts = ref.split("\\[\\]\\.");
        if (parts.length != 2) return el;

        JsonNode group = formData.get(parts[0]);
        if (group == null || !group.isArray() || rowIdx >= group.size()) return el;

        JsonNode value = group.get(rowIdx).get(parts[1]);
        if (value == null) return el;

        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            // Offset Y by the row's position within the current page
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) {
                ObjectNode frameCopy = (ObjectNode) frame;
                float stride = Float.isNaN(strideMm) || strideMm <= 0
                        ? PdfUtils.floatOf(frame, "height") : strideMm;
                float baseY = PdfUtils.floatOf(frame, "y");
                frameCopy.put("y", baseY + stride * (rowIdx % rowsPerPage));
            }
            // Set the resolved value into props
            ObjectNode props = copy.has("props") && copy.get("props").isObject()
                    ? (ObjectNode) copy.get("props")
                    : MAPPER.createObjectNode();
            String kind = resolveKind(el);
            String propKey = propKeyFor(kind);
            applyValue(props, propKey, value);
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    // ── System values (issue #54) ───────────────────────────────────────

    /**
     * Resolve render-time system values into the element's value prop:
     * pageNumber / currentDate elements format themselves from the page
     * context, and legacy {@code {pageNumber}} / {@code {totalPages}} /
     * {@code {currentDate}} bindingRefs substitute their current value.
     */
    private static JsonNode resolveSystemValues(JsonNode el, PageContext ctx) {
        String kind = resolveKind(el);
        String value = null;
        if ("pageNumber".equals(kind)) {
            value = SystemValueResolver.formatPageNumber(
                    PdfUtils.elementTextOf(el, "format", "{{page}}"),
                    PdfUtils.elementTextOf(el, "customFormat", ""),
                    ctx.pageIndex() + 1, ctx.totalPages());
        } else if ("currentDate".equals(kind)) {
            value = SystemValueResolver.formatCurrentDate(
                    PdfUtils.elementTextOf(el, "format", ""),
                    PdfUtils.elementTextOf(el, "customFormat", ""),
                    ctx.printDate());
        } else {
            JsonNode ref = el.get("bindingRef");
            if (ref != null && ref.isTextual()) {
                switch (ref.asText()) {
                    case "{pageNumber}" -> value = String.valueOf(ctx.pageIndex() + 1);
                    case "{totalPages}" -> value = String.valueOf(ctx.totalPages());
                    case "{currentDate}" -> value = SystemValueResolver.formatCurrentDate(
                            "yyyy/MM/dd", null, ctx.printDate());
                    default -> { /* not a system variable */ }
                }
            }
        }
        if (value == null) return el;
        return withResolvedProp(el, com.fasterxml.jackson.databind.node.TextNode.valueOf(value));
    }

    // ── Row-region geometry (issue #55) ─────────────────────────────────

    /**
     * Compute the row-unit region of a paginating section from its row_block
     * elements: {@code [startYmm, strideMm]} where startY is the topmost
     * row_block frame Y and stride is the unit's full vertical extent
     * (max(y+height) − min(y)). Returns null when the section has no
     * row_block with usable geometry.
     */
    public static float[] computeRowRegion(JsonNode section) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return null;
        float minY = Float.MAX_VALUE;
        float maxBottom = -Float.MAX_VALUE;
        for (JsonNode el : elements) {
            if (!"row_block".equals(resolveKind(el))) continue;
            JsonNode frame = el.get("frame");
            if (frame == null) continue;
            float y = PdfUtils.floatOf(frame, "y");
            float h = PdfUtils.floatOf(frame, "height");
            minY = Math.min(minY, y);
            maxBottom = Math.max(maxBottom, y + h);
        }
        if (minY == Float.MAX_VALUE || maxBottom <= minY) return null;
        return new float[]{minY, maxBottom - minY};
    }

    /**
     * Height-derived row capacity: how many whole row units fit between the
     * topmost row_block and the section's bottom edge ({@code section.y +
     * section.height}). Returns -1 when the geometry is not computable, so
     * callers can fall back to their legacy default.
     */
    public static int computeRowCapacity(JsonNode section) {
        float[] region = computeRowRegion(section);
        if (region == null) return -1;
        float sectionY = PdfUtils.floatOf(section, "y", 0);
        float sectionH = PdfUtils.floatOf(section, "height", 0);
        if (sectionH <= 0) return -1;
        float available = sectionY + sectionH - region[0];
        if (available < region[1]) return 1;
        return (int) Math.floor(available / region[1]);
    }

    // ── Private helpers ─────────────────────────────────────────────────

    private static JsonNode withResolvedProp(JsonNode el, JsonNode value) {
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode props = copy.has("props") && copy.get("props").isObject()
                    ? (ObjectNode) copy.get("props")
                    : MAPPER.createObjectNode();
            String kind = resolveKind(el);
            String propKey = propKeyFor(kind);
            applyValue(props, propKey, value);
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    private static String resolveKind(JsonNode el) {
        String kind = PdfUtils.textOf(el, "kind", "");
        return kind.isEmpty() ? PdfUtils.textOf(el, "type", "") : kind;
    }

    /**
     * Resolve the element's data-binding key. V1/V2 shared elements use
     * {@code bindingRef}; some V2 types carry their own field:
     * eraSelect ({@code dataSource}) and hanko ({@code binding}).
     * Returns null when the element has no binding.
     */
    private static String resolveBindingRef(JsonNode el) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode != null && bindingRefNode.isTextual()) return bindingRefNode.asText();
        String kind = resolveKind(el);
        String v2Field = switch (kind) {
            case "eraSelect" -> "dataSource";
            case "hanko" -> "binding";
            case "dataField" -> "fieldKey";
            default -> null;
        };
        if (v2Field == null) return null;
        JsonNode node = el.get(v2Field);
        return node != null && node.isTextual() && !node.asText().isBlank() ? node.asText() : null;
    }

    private static String propKeyFor(String kind) {
        return switch (kind) {
            case "checkbox" -> "checked";
            case "radio_mark" -> "selected";
            case "barcode", "qrcode" -> "value";
            default -> "text";
        };
    }

    private static void applyValue(ObjectNode props, String propKey, JsonNode value) {
        if (value.isTextual()) props.put(propKey, value.asText());
        else if (value.isNumber()) props.put(propKey, value.isInt()
                ? String.valueOf(value.asInt()) : String.valueOf(value.asDouble()));
        else if (value.isBoolean()) props.put(propKey, value.asBoolean());
    }

    /**
     * Apply masking rules from a VariantContext to an element's text/value prop.
     * Returns the original node if no masking rule applies.
     */
    private static JsonNode applyMaskingToElement(JsonNode el, VariantContext variantCtx) {
        String elId = PdfUtils.textOf(el, "id", "");
        if (elId.isBlank()) return el;
        String kind = resolveKind(el);
        String propKey = propKeyFor(kind);
        JsonNode props = el.get("props");
        if (props == null || !props.isObject()) return el;
        JsonNode valueProp = props.get(propKey);
        String originalValue = valueProp != null ? valueProp.asText(null) : null;
        if (originalValue == null) return el;
        String maskedValue = variantCtx.applyMasking(elId, originalValue);
        if (maskedValue.equals(originalValue)) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode propsCopy = (ObjectNode) copy.get("props");
            propsCopy.put(propKey, maskedValue);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }
}
