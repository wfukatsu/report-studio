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

    public static final float MM_TO_PT = PdfUnits.MM_TO_PT;
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
        renderElementsPaged(ctx, section, formData, variantCtx, 0);
    }

    /**
     * Render elements on a specific section-local physical page (issue #55).
     *
     * <p>For relative sections, pushdown chains that flow beyond the section's
     * bottom edge are auto-paginated ({@link RelativeLayoutResolver#paginate}):
     * an element assigned to continuation page {@code k > 0} renders only when
     * {@code pageIdx == k}, at its wrapped Y. Elements that fit the first page
     * keep today's behavior (drawn on every physical page the section renders
     * on, subject to {@code pageScope}).
     */
    public static void renderElementsPaged(PageContext ctx, JsonNode section, JsonNode formData,
                                           VariantContext variantCtx, int pageIdx) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;

        boolean isRelative = "relative".equals(PdfUtils.textOf(section, "layoutMode", "absolute"));
        RelativeLayoutResolver.PagedLayout layout = isRelative
                ? pushdownLayout(section) : RelativeLayoutResolver.PagedLayout.SINGLE_PAGE;

        for (JsonNode el : elements) {
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, 0)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            int elementPage = layout.pageOf().getOrDefault(elId, 0);
            if (elementPage > 0 && elementPage != pageIdx) continue;
            JsonNode withLayout = isRelative
                    ? RelativeLayoutResolver.applyEffectiveY(el, layout.pagedY()) : el;
            JsonNode resolved = formData != null ? resolveFormData(withLayout, formData) : withLayout;
            JsonNode masked = applyMaskingToElement(resolved, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /**
     * Pushdown page-overflow layout of a relative section (issue #55).
     * Absolute sections and sections without a usable height are single-page.
     */
    public static RelativeLayoutResolver.PagedLayout pushdownLayout(JsonNode section) {
        if (!"relative".equals(PdfUtils.textOf(section, "layoutMode", "absolute"))) {
            return RelativeLayoutResolver.PagedLayout.SINGLE_PAGE;
        }
        float top = PdfUtils.floatOf(section, "y", 0);
        float height = PdfUtils.floatOf(section, "height", 0);
        return RelativeLayoutResolver.paginate(section.get("elements"), top, height);
    }

    /** Number of section-local physical pages the pushdown overflow needs (≥1). */
    public static int pushdownPages(JsonNode section) {
        return pushdownLayout(section).pageCount();
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
     * Carry-over elements are skipped — the section renderer draws them
     * with page-aware sums (issue #55).
     */
    public static void renderNonRowElements(PageContext ctx, JsonNode section, JsonNode formData,
                                            VariantContext variantCtx) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            String kind = resolveKind(el);
            if ("row_block".equals(kind)) continue;
            if ("carryover_header".equals(kind) || "carryover_footer".equals(kind)) continue;
            if ("group_header".equals(kind)) continue; // drawn per-group by the section renderer
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

    /**
     * Render row_block elements for data row {@code rowIdx} placed at page slot
     * {@code rowOnPage} (issue #55 — used by the group-aware page plan).
     */
    public static void renderRowAtPosition(PageContext ctx, JsonNode section, JsonNode formData,
                                           int rowIdx, int rowOnPage, VariantContext variantCtx,
                                           float strideMm) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!"row_block".equals(resolveKind(el))) continue;
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, rowIdx)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode rowEl = resolveDetailRowAt(el, formData, rowIdx, rowOnPage, strideMm);
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
        // Array-bound elements copy a whole _formData array into props.data:
        // chart (dataBinding), repeatingBand / repeatingList (dataSource)
        String kind = resolveKind(el);
        if ("chart".equals(kind)) {
            return resolveArrayData(el, formData, "dataBinding");
        }
        if ("repeatingBand".equals(kind) || "repeatingList".equals(kind)) {
            return resolveArrayData(el, formData, "dataSource");
        }
        // formTable resolves dataField cells from an element-level _formData;
        // production only sets it on the projection root, so inject it here so
        // dataField cells are no longer blank in server PDFs (issue #52/#53)
        if ("formTable".equals(kind) && el.get("_formData") == null && formData != null) {
            try {
                ObjectNode copy = (ObjectNode) el.deepCopy();
                copy.set("_formData", formData.deepCopy());
                return copy;
            } catch (Exception e) {
                return el;
            }
        }
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
            value = resolveDataPath(formData, ref);
        }

        if (value == null) return el;
        return withResolvedProp(el, value);
    }

    /** Copy the bound data array ({@code field} → {@code _formData[key]}) into props.data. */
    private static JsonNode resolveArrayData(JsonNode el, JsonNode formData, String field) {
        String key = PdfUtils.elementTextOf(el, field, "");
        if (key.isEmpty() || formData == null) return el;
        JsonNode arr = formData.get(key);
        if (arr == null || !arr.isArray()) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode props = copy.has("props") && copy.get("props").isObject()
                    ? (ObjectNode) copy.get("props") : MAPPER.createObjectNode();
            props.set("data", arr.deepCopy());
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
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
        return resolveDetailRowAt(el, formData, rowIdx, rowIdx % Math.max(rowsPerPage, 1), strideMm);
    }

    /**
     * Position-explicit variant (issue #55): the value comes from data row
     * {@code rowIdx}, but the Y offset uses {@code rowOnPage} — the row's slot
     * on the current physical page. This lets a group's first page start at
     * slot 0 even when its data index does not align to a rowsPerPage boundary.
     */
    public static JsonNode resolveDetailRowAt(JsonNode el, JsonNode formData,
                                              int rowIdx, int rowOnPage, float strideMm) {
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
            // Offset Y by the row's slot on the current page
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) {
                ObjectNode frameCopy = (ObjectNode) frame;
                float stride = Float.isNaN(strideMm) || strideMm <= 0
                        ? PdfUtils.floatOf(frame, "height") : strideMm;
                float baseY = PdfUtils.floatOf(frame, "y");
                frameCopy.put("y", baseY + stride * rowOnPage);
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

    // ── Split-policy support for multi_row_table (issue #55) ────────────

    /** row_block elements of a section, sorted top-to-bottom by frame.y. */
    public static java.util.List<JsonNode> sortedRowBlocks(JsonNode section) {
        java.util.List<JsonNode> blocks = new java.util.ArrayList<>();
        JsonNode elements = section.get("elements");
        if (elements != null && elements.isArray()) {
            for (JsonNode el : elements) {
                if ("row_block".equals(resolveKind(el))) blocks.add(el);
            }
        }
        blocks.sort(java.util.Comparator.comparingDouble(el -> {
            JsonNode f = el.get("frame");
            return f != null ? PdfUtils.floatOf(f, "y") : 0f;
        }));
        return blocks;
    }

    /**
     * Render one physical row of a splittable multi_row_table (issue #55):
     * the row_block {@code block} carries data from record {@code recordIdx} and
     * is drawn at absolute {@code yMm} — so a logical unit's rows can straddle a
     * page boundary ({@code splitPolicy: allowed-between-rows}).
     */
    public static void renderSplitRow(PageContext ctx, JsonNode block, JsonNode formData,
                                      int recordIdx, float yMm, VariantContext variantCtx) {
        if (!ConditionEvaluator.shouldRender(block, formData, recordIdx)) return;
        String elId = PdfUtils.textOf(block, "id", "");
        if (!variantCtx.isVisible(elId, PdfUtils.boolOf(block, "visible", true))) return;
        JsonNode resolved = resolveRowValueAtY(block, formData, recordIdx, yMm);
        renderElement(ctx, applyMaskingToElement(resolved, variantCtx));
    }

    /** Copy a row_block with record {@code recordIdx}'s value and an absolute frame.y. */
    private static JsonNode resolveRowValueAtY(JsonNode el, JsonNode formData, int recordIdx, float yMm) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode == null || !bindingRefNode.isTextual() || formData == null) return el;
        String ref = bindingRefNode.asText();
        if (!ref.contains("[]")) return el;
        String[] parts = ref.split("\\[\\]\\.");
        if (parts.length != 2) return el;
        JsonNode group = formData.get(parts[0]);
        if (group == null || !group.isArray() || recordIdx >= group.size()) return el;
        JsonNode value = group.get(recordIdx).get(parts[1]);
        if (value == null) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) ((ObjectNode) frame).put("y", yMm);
            ObjectNode props = copy.has("props") && copy.get("props").isObject()
                    ? (ObjectNode) copy.get("props") : MAPPER.createObjectNode();
            applyValue(props, propKeyFor(resolveKind(el)), value);
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    /**
     * Resolve a scalar data reference: exact key first (legacy flat projection
     * data), then dot-notation traversal into nested objects — mirroring the
     * frontend {@code resolveField} (e.g. {@code "document.documentNo"} into
     * {@code {document: {documentNo: ...}}}). Returns null when unresolved.
     */
    public static JsonNode resolveDataPath(JsonNode data, String ref) {
        if (data == null || ref == null || ref.isEmpty()) return null;
        JsonNode direct = data.get(ref);
        if (direct != null && !direct.isNull()) return direct;
        if (!ref.contains(".")) return null;
        JsonNode cur = data;
        for (String part : ref.split("\\.")) {
            if (cur == null || !cur.isObject()) return null;
            cur = cur.get(part);
        }
        return (cur == null || cur.isNull()) ? null : cur;
    }

    /** Available vertical space (mm) from the topmost row_block to the section bottom, or -1. */
    public static float computeAvailableHeight(JsonNode section) {
        float[] region = computeRowRegion(section);
        if (region == null) return -1;
        float sectionY = PdfUtils.floatOf(section, "y", 0);
        float sectionH = PdfUtils.floatOf(section, "height", 0);
        if (sectionH <= 0) return -1;
        return sectionY + sectionH - region[0];
    }

    // ── Group page-break plan (issue #55) ───────────────────────────────

    /** One physical page's row slice of a paginating section. */
    public record PageSlice(int startRow, int endRow, boolean groupFirstPage, String groupValue) {}

    /**
     * Build the per-physical-page row plan for a paginating section.
     *
     * <p>Without {@code groupBy}: contiguous {@code rowsPerPage} slices.
     * With {@code groupBy}: rows are partitioned by that field's value (in row
     * order), each group is paginated independently, and **groups never share a
     * page** — i.e. every group starts on a fresh physical page. The first page
     * of each group is flagged so a group header can be drawn.
     */
    public static java.util.List<PageSlice> buildPagePlan(JsonNode section, JsonNode formData,
                                                          int rowsPerPage) {
        int total = 0;
        String groupName = findRowGroupName(section);
        JsonNode rows = (formData != null && groupName != null) ? formData.get(groupName) : null;
        if (rows != null && rows.isArray()) total = rows.size();

        java.util.List<PageSlice> plan = new java.util.ArrayList<>();
        int rpp = Math.max(rowsPerPage, 1);
        String groupBy = PdfUtils.elementTextOf(section, "groupBy", "");

        if (groupBy.isEmpty() || rows == null) {
            // Flat pagination
            if (total == 0) { plan.add(new PageSlice(0, 0, true, null)); return plan; }
            for (int start = 0; start < total; start += rpp) {
                plan.add(new PageSlice(start, Math.min(start + rpp, total), start == 0, null));
            }
            return plan;
        }

        // Grouped pagination — page breaks at each group boundary
        int groupStart = 0;
        while (groupStart < total) {
            String gv = valueAt(rows, groupStart, groupBy);
            int groupEnd = groupStart;
            while (groupEnd < total && java.util.Objects.equals(valueAt(rows, groupEnd, groupBy), gv)) {
                groupEnd++;
            }
            for (int s = groupStart; s < groupEnd; s += rpp) {
                plan.add(new PageSlice(s, Math.min(s + rpp, groupEnd), s == groupStart, gv));
            }
            groupStart = groupEnd;
        }
        return plan.isEmpty() ? java.util.List.of(new PageSlice(0, 0, true, null)) : plan;
    }

    private static String valueAt(JsonNode rows, int idx, String field) {
        JsonNode v = rows.get(idx).get(field);
        return v == null || v.isNull() ? "" : v.asText("");
    }

    /**
     * Render a group-header element ({@code kind: "group_header"}) with the
     * current group's value, on the first page of each group (issue #55).
     * Fields: {@code prefix}/{@code suffix} text, {@code style}.
     */
    public static void renderGroupHeader(PageContext ctx, JsonNode section, PageSlice slice) {
        if (!slice.groupFirstPage() || slice.groupValue() == null) return;
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!"group_header".equals(resolveKind(el))) continue;
            String text = PdfUtils.elementTextOf(el, "prefix", "")
                    + slice.groupValue()
                    + PdfUtils.elementTextOf(el, "suffix", "");
            renderElement(ctx, withResolvedProp(el,
                    com.fasterxml.jackson.databind.node.TextNode.valueOf(text)));
        }
    }

    // ── Carry-over totals (issue #55) ────────────────────────────────────

    /**
     * Render carry-over elements of a paginating section (帳票の繰越小計).
     *
     * <p>Two special element kinds, positioned by their own frames:
     * <ul>
     *   <li>{@code carryover_footer} — drawn on every page that has more rows
     *       coming (「次頁へ続く」); value = sum of rows [0, endRow)</li>
     *   <li>{@code carryover_header} — drawn on continuation pages
     *       (「前頁より繰越」); value = sum of rows [0, startRow)</li>
     * </ul>
     *
     * <p>Element fields: {@code carryField} (field name inside the row group,
     * required; values must be numeric), optional {@code prefix} / {@code suffix}
     * text, optional {@code format} (CalculationFormat), {@code style} (TextStyle).
     */
    public static void renderCarryOverElements(PageContext ctx, JsonNode section, JsonNode formData,
                                               int startRow, int endRow, int totalRows) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray() || formData == null) return;
        String group = findRowGroupName(section);
        if (group == null) return;
        JsonNode rows = formData.get(group);
        if (rows == null || !rows.isArray()) return;

        for (JsonNode el : elements) {
            String kind = resolveKind(el);
            boolean footer = "carryover_footer".equals(kind);
            boolean header = "carryover_header".equals(kind);
            if (!footer && !header) continue;
            if (footer && endRow >= totalRows) continue; // final page — nothing continues
            if (header && startRow == 0) continue;       // first page — nothing carried

            String field = PdfUtils.elementTextOf(el, "carryField", "");
            if (field.isEmpty()) continue;

            double sum = 0;
            int limit = Math.min(footer ? endRow : startRow, rows.size());
            for (int i = 0; i < limit; i++) {
                JsonNode v = rows.get(i).get(field);
                if (v == null) continue;
                if (v.isNumber()) {
                    sum += v.asDouble();
                } else if (v.isTextual()) {
                    try {
                        sum += Double.parseDouble(v.asText().trim());
                    } catch (NumberFormatException ignored) {
                        // non-numeric row value — skip
                    }
                }
            }

            JsonNode numNode = (sum == Math.rint(sum) && Math.abs(sum) < 1e15)
                    ? com.fasterxml.jackson.databind.node.LongNode.valueOf((long) sum)
                    : com.fasterxml.jackson.databind.node.DoubleNode.valueOf(sum);
            String text = PdfUtils.elementTextOf(el, "prefix", "")
                    + com.report.server.ValueFormatter.applyFormat(numNode, el.get("format"))
                    + PdfUtils.elementTextOf(el, "suffix", "");
            renderElement(ctx, withResolvedProp(el,
                    com.fasterxml.jackson.databind.node.TextNode.valueOf(text)));
        }
    }

    /** Group name from the first row_block bindingRef ({@code group[].field}). */
    private static String findRowGroupName(JsonNode section) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return null;
        for (JsonNode el : elements) {
            if (!"row_block".equals(resolveKind(el))) continue;
            JsonNode ref = el.get("bindingRef");
            if (ref != null && ref.isTextual() && ref.asText().contains("[]")) {
                return ref.asText().split("\\[\\]")[0];
            }
        }
        return null;
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
        if (kind.startsWith("tenant")) {
            return resolveTenantElement(el, kind, ctx.tenant());
        }
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

    /**
     * Resolve V2 tenant* elements from the TenantInfo document (issue #54).
     * Text elements fall back to the element's {@code fallback} when the
     * tenant field is unset; tenantLogo is rewritten to an {@code image}
     * element so ImagePdfRenderer handles the data-URI.
     */
    private static JsonNode resolveTenantElement(JsonNode el, String kind, JsonNode tenant) {
        if ("tenantLogo".equals(kind)) {
            String src = tenant != null ? PdfUtils.textOf(tenant, "logoBase64", "") : "";
            if (src.isEmpty()) return el; // no logo — image renderer draws nothing useful; keep fallback box
            try {
                ObjectNode copy = (ObjectNode) el.deepCopy();
                copy.put("kind", "image");
                ObjectNode props = copy.has("props") && copy.get("props").isObject()
                        ? (ObjectNode) copy.get("props") : MAPPER.createObjectNode();
                props.put("src", src);
                if (el.hasNonNull("objectFit")) props.put("objectFit", el.get("objectFit").asText());
                if (el.hasNonNull("opacity")) props.put("opacity", el.get("opacity").asDouble());
                copy.set("props", props);
                return copy;
            } catch (Exception e) {
                return el;
            }
        }

        String value = tenant == null ? "" : switch (kind) {
            case "tenantCompanyName" -> PdfUtils.textOf(tenant, "companyName", "");
            case "tenantAddress" -> {
                boolean multiline = "multiLine".equals(PdfUtils.elementTextOf(el, "displayMode", "single"));
                yield com.report.server.ValueFormatter.formatAddress(tenant, multiline);
            }
            case "tenantPhone" -> PdfUtils.textOf(tenant, "phone", "");
            case "tenantRepresentative" -> PdfUtils.textOf(tenant, "representativeName", "");
            case "tenantCustom" -> {
                String fieldKey = PdfUtils.elementTextOf(el, "fieldKey", "");
                JsonNode custom = tenant.get("custom");
                yield custom != null && !fieldKey.isEmpty()
                        ? PdfUtils.textOf(custom, fieldKey, "") : "";
            }
            default -> "";
        };
        if (value.isEmpty()) {
            value = PdfUtils.elementTextOf(el, "fallback", "");
        }
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
            case "manualEntry" -> "furiganaDataSource";
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
        if (value.isTextual()) {
            props.put(propKey, value.asText());
        } else if (value.isNumber()) {
            // Integral values print without ".0" — BigDecimal calc results
            // (issue #57) and JSON doubles like 450.0 both become "450"
            double d = value.asDouble();
            props.put(propKey, (d == Math.rint(d) && Math.abs(d) < 1e15)
                    ? String.valueOf((long) d) : String.valueOf(d));
        } else if (value.isBoolean()) {
            props.put(propKey, value.asBoolean());
        }
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
