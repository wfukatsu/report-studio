package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.report.server.ConditionEvaluator;

/**
 * Shared element-rendering facade for SectionPdfRenderer implementations.
 *
 * <p>Keeps the section-level element loops and delegates the per-concern logic to package-local
 * collaborators (#276):
 *
 * <ul>
 *   <li>{@link ElementRenderDispatcher} — single-element mm→pt dispatch to the renderer registry
 *   <li>{@link RenderTimeSystemValues} — pageNumber / currentDate / tenant* resolution
 *   <li>{@link FormDataResolver} — scalar, array, and row-indexed binding resolution
 *   <li>{@link BandFlowPlanner} — repeatingBand / repeatingList page flow (issue #64)
 *   <li>{@link SectionGeometry} — pushdown layout, row-region and capacity math
 *   <li>{@link PagePlanBuilder} — group page plan, group headers, carry-over totals (issue #55)
 *   <li>{@link ElementNodeSupport} — kind/binding resolution, prop copying, variant masking
 * </ul>
 */
public final class SectionRenderHelper {

    public static final float MM_TO_PT = PdfUnits.MM_TO_PT;

    private SectionRenderHelper() {}

    // ── Element rendering ───────────────────────────────────────────────

    /**
     * Render all elements in a section, applying conditional display and scalar formData bindings.
     * Row-indexed bindings (bindingRef containing "[]") are not resolved here — use {@link
     * #renderElementsForRow} for detail/multi-row sections.
     *
     * <p>If the section has {@code layoutMode: "relative"}, element Y positions are pre-computed
     * via {@link RelativeLayoutResolver} before rendering.
     */
    public static void renderElements(PageContext ctx, JsonNode section, JsonNode formData) {
        renderElements(ctx, section, formData, VariantContext.empty());
    }

    /** Render all elements with variant-aware visibility and masking. */
    public static void renderElements(
            PageContext ctx, JsonNode section, JsonNode formData, VariantContext variantCtx) {
        renderElementsPaged(ctx, section, formData, variantCtx, 0);
    }

    /**
     * Render elements on a specific section-local physical page (issue #55).
     *
     * <p>For relative sections, pushdown chains that flow beyond the section's bottom edge are
     * auto-paginated ({@link RelativeLayoutResolver#paginate}): an element assigned to continuation
     * page {@code k > 0} renders only when {@code pageIdx == k}, at its wrapped Y. Elements that
     * fit the first page keep today's behavior (drawn on every physical page the section renders
     * on, subject to {@code pageScope}).
     */
    public static void renderElementsPaged(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            VariantContext variantCtx,
            int pageIdx) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;

        boolean isRelative = "relative".equals(PdfUtils.textOf(section, "layoutMode", "absolute"));
        RelativeLayoutResolver.PagedLayout layout =
                isRelative
                        ? pushdownLayout(section)
                        : RelativeLayoutResolver.PagedLayout.SINGLE_PAGE;

        for (JsonNode el : elements) {
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, 0)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            int elementPage = layout.pageOf().getOrDefault(elId, 0);
            if (elementPage > 0 && elementPage != pageIdx) continue;
            JsonNode withLayout =
                    isRelative ? RelativeLayoutResolver.applyEffectiveY(el, layout.pagedY()) : el;
            JsonNode resolved =
                    formData != null ? resolveFormData(withLayout, formData) : withLayout;
            // Band elements draw a per-page record window (issue #64)
            resolved = BandFlowPlanner.applyBandWindow(resolved, pageIdx);
            if (resolved == null) continue;
            JsonNode masked = ElementNodeSupport.applyMaskingToElement(resolved, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /**
     * Pushdown page-overflow layout of a relative section (issue #55). Absolute sections and
     * sections without a usable height are single-page.
     */
    public static RelativeLayoutResolver.PagedLayout pushdownLayout(JsonNode section) {
        return SectionGeometry.pushdownLayout(section);
    }

    /** Number of section-local physical pages the pushdown overflow needs (≥1). */
    public static int pushdownPages(JsonNode section) {
        return pushdownLayout(section).pageCount();
    }

    /**
     * Render all non-row-block elements (header/footer of a table section). Used to render column
     * headers and section-level decorations.
     */
    public static void renderNonRowElements(PageContext ctx, JsonNode section, JsonNode formData) {
        renderNonRowElements(ctx, section, formData, VariantContext.empty());
    }

    /**
     * Render all non-row-block elements with variant-aware masking. Carry-over elements are skipped
     * — the section renderer draws them with page-aware sums (issue #55).
     */
    public static void renderNonRowElements(
            PageContext ctx, JsonNode section, JsonNode formData, VariantContext variantCtx) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            String kind = ElementNodeSupport.resolveKind(el);
            if ("row_block".equals(kind)) continue;
            if ("carryover_header".equals(kind) || "carryover_footer".equals(kind)) continue;
            if ("group_header".equals(kind)) continue; // drawn per-group by the section renderer
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode resolved = formData != null ? resolveFormData(el, formData) : el;
            JsonNode masked = ElementNodeSupport.applyMaskingToElement(resolved, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /**
     * Render a single row_block element with data from a specific logical row index.
     *
     * @param ctx page context
     * @param el row_block element JSON node
     * @param formData form data
     * @param rowIdx zero-based logical row index
     * @param rowsPerPage rows per page (used for Y-offset calculation within page)
     */
    public static void renderElementsForRow(
            PageContext ctx, JsonNode section, JsonNode formData, int rowIdx, int rowsPerPage) {
        renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage, VariantContext.empty());
    }

    /**
     * Render row_block elements with variant-aware visibility and masking. The row stride defaults
     * to each element's own frame height.
     */
    public static void renderElementsForRow(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            int rowIdx,
            int rowsPerPage,
            VariantContext variantCtx) {
        renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage, variantCtx, Float.NaN);
    }

    /**
     * Render row_block elements with an explicit row-unit stride (mm). Multi-row units must advance
     * by the whole unit's extent, not each element's own height (issue #55).
     */
    public static void renderElementsForRow(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            int rowIdx,
            int rowsPerPage,
            VariantContext variantCtx,
            float strideMm) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!"row_block".equals(ElementNodeSupport.resolveKind(el))) continue;
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, rowIdx)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode rowEl = resolveDetailRow(el, formData, rowIdx, rowsPerPage, strideMm);
            JsonNode masked = ElementNodeSupport.applyMaskingToElement(rowEl, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /**
     * Render row_block elements for data row {@code rowIdx} placed at page slot {@code rowOnPage}
     * (issue #55 — used by the group-aware page plan).
     */
    public static void renderRowAtPosition(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            int rowIdx,
            int rowOnPage,
            VariantContext variantCtx,
            float strideMm) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!"row_block".equals(ElementNodeSupport.resolveKind(el))) continue;
            String elId = PdfUtils.textOf(el, "id", "");
            boolean baseVisible = PdfUtils.boolOf(el, "visible", true);
            if (!ConditionEvaluator.shouldRender(el, formData, rowIdx)) continue;
            if (!variantCtx.isVisible(elId, baseVisible)) continue;
            JsonNode rowEl =
                    FormDataResolver.resolveDetailRowAt(el, formData, rowIdx, rowOnPage, strideMm);
            JsonNode masked = ElementNodeSupport.applyMaskingToElement(rowEl, variantCtx);
            renderElement(ctx, masked);
        }
    }

    /** Render a single element via the ElementPdfRendererRegistry. */
    public static void renderElement(PageContext ctx, JsonNode el) {
        ElementRenderDispatcher.renderElement(ctx, el);
    }

    // ── Form data resolution ────────────────────────────────────────────

    /**
     * Resolve scalar form data bindings into element props. Master fields: "group.field" →
     * _formData["group.field"] Detail fields (first row only): "group[].field" →
     * _formData.group[0].field
     */
    public static JsonNode resolveFormData(JsonNode el, JsonNode formData) {
        return FormDataResolver.resolveFormData(el, formData);
    }

    /**
     * Create a copy of a row element with data from the given logical row index. The element Y
     * position is offset by {@code (rowIdx % rowsPerPage) * rowHeight}.
     */
    public static JsonNode resolveDetailRow(
            JsonNode el, JsonNode formData, int rowIdx, int rowsPerPage) {
        return resolveDetailRow(el, formData, rowIdx, rowsPerPage, Float.NaN);
    }

    /**
     * Stride-aware variant: the Y offset per logical row is {@code strideMm} (the row unit's full
     * extent); NaN falls back to the element's own height.
     */
    public static JsonNode resolveDetailRow(
            JsonNode el, JsonNode formData, int rowIdx, int rowsPerPage, float strideMm) {
        return resolveDetailRowAt(
                el, formData, rowIdx, rowIdx % Math.max(rowsPerPage, 1), strideMm);
    }

    /**
     * Position-explicit variant (issue #55): the value comes from data row {@code rowIdx}, but the
     * Y offset uses {@code rowOnPage} — the row's slot on the current physical page. This lets a
     * group's first page start at slot 0 even when its data index does not align to a rowsPerPage
     * boundary.
     */
    public static JsonNode resolveDetailRowAt(
            JsonNode el, JsonNode formData, int rowIdx, int rowOnPage, float strideMm) {
        return FormDataResolver.resolveDetailRowAt(el, formData, rowIdx, rowOnPage, strideMm);
    }

    // ── Split-policy support for multi_row_table (issue #55) ────────────

    /** row_block elements of a section, sorted top-to-bottom by frame.y. */
    public static java.util.List<JsonNode> sortedRowBlocks(JsonNode section) {
        return SectionGeometry.sortedRowBlocks(section);
    }

    /**
     * Render one physical row of a splittable multi_row_table (issue #55): the row_block {@code
     * block} carries data from record {@code recordIdx} and is drawn at absolute {@code yMm} — so a
     * logical unit's rows can straddle a page boundary ({@code splitPolicy: allowed-between-rows}).
     */
    public static void renderSplitRow(
            PageContext ctx,
            JsonNode block,
            JsonNode formData,
            int recordIdx,
            float yMm,
            VariantContext variantCtx) {
        if (!ConditionEvaluator.shouldRender(block, formData, recordIdx)) return;
        String elId = PdfUtils.textOf(block, "id", "");
        if (!variantCtx.isVisible(elId, PdfUtils.boolOf(block, "visible", true))) return;
        JsonNode resolved = FormDataResolver.resolveRowValueAtY(block, formData, recordIdx, yMm);
        renderElement(ctx, ElementNodeSupport.applyMaskingToElement(resolved, variantCtx));
    }

    // ── V2 band flow (issue #64) ─────────────────────────────────────────

    /**
     * Records per page a repeatingBand / repeatingList element can hold, or 0 when the element
     * cannot flow (no usable geometry; list layouts other than vertical keep the historical clip
     * behavior).
     */
    public static int bandCapacity(JsonNode el) {
        return BandFlowPlanner.bandCapacity(el);
    }

    /**
     * Section-local pages needed to flow every band element's bound records (issue #64). Records
     * dropped by {@code maxItems} are an explicit designer choice and do not flow.
     */
    public static int bandFlowPages(JsonNode section, JsonNode formData) {
        return BandFlowPlanner.bandFlowPages(section, formData);
    }

    /**
     * Combined non-paginating-section overflow page count: pushdown layout (issue #55) and band
     * flow (issue #64).
     */
    public static int sectionOverflowPages(JsonNode section, JsonNode formData) {
        return Math.max(pushdownPages(section), bandFlowPages(section, formData));
    }

    /**
     * Resolve a scalar data reference: exact key first (legacy flat projection data), then
     * dot-notation traversal into nested objects — mirroring the frontend {@code resolveField}
     * (e.g. {@code "document.documentNo"} into {@code {document: {documentNo: ...}}}). Returns null
     * when unresolved.
     */
    public static JsonNode resolveDataPath(JsonNode data, String ref) {
        return FormDataResolver.resolveDataPath(data, ref);
    }

    /** Available vertical space (mm) from the topmost row_block to the section bottom, or -1. */
    public static float computeAvailableHeight(JsonNode section) {
        return SectionGeometry.computeAvailableHeight(section);
    }

    // ── Group page-break plan (issue #55) ───────────────────────────────

    /** One physical page's row slice of a paginating section. */
    public record PageSlice(int startRow, int endRow, boolean groupFirstPage, String groupValue) {}

    /**
     * Build the per-physical-page row plan for a paginating section.
     *
     * <p>Without {@code groupBy}: contiguous {@code rowsPerPage} slices. With {@code groupBy}: rows
     * are partitioned by that field's value (in row order), each group is paginated independently,
     * and **groups never share a page** — i.e. every group starts on a fresh physical page. The
     * first page of each group is flagged so a group header can be drawn.
     */
    public static java.util.List<PageSlice> buildPagePlan(
            JsonNode section, JsonNode formData, int rowsPerPage) {
        return PagePlanBuilder.buildPagePlan(section, formData, rowsPerPage);
    }

    /**
     * Render a group-header element ({@code kind: "group_header"}) with the current group's value,
     * on the first page of each group (issue #55). Fields: {@code prefix}/{@code suffix} text,
     * {@code style}.
     */
    public static void renderGroupHeader(PageContext ctx, JsonNode section, PageSlice slice) {
        PagePlanBuilder.renderGroupHeader(ctx, section, slice);
    }

    // ── Carry-over totals (issue #55) ────────────────────────────────────

    /**
     * Render carry-over elements of a paginating section (帳票の繰越小計).
     *
     * <p>Two special element kinds, positioned by their own frames:
     *
     * <ul>
     *   <li>{@code carryover_footer} — drawn on every page that has more rows coming (「次頁へ続く」);
     *       value = sum of rows [0, endRow)
     *   <li>{@code carryover_header} — drawn on continuation pages (「前頁より繰越」); value = sum of rows
     *       [0, startRow)
     * </ul>
     *
     * <p>Element fields: {@code carryField} (field name inside the row group, required; values must
     * be numeric), optional {@code prefix} / {@code suffix} text, optional {@code format}
     * (CalculationFormat), {@code style} (TextStyle).
     */
    public static void renderCarryOverElements(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            int startRow,
            int endRow,
            int totalRows) {
        PagePlanBuilder.renderCarryOverElements(
                ctx, section, formData, startRow, endRow, totalRows);
    }

    // ── Row-region geometry (issue #55) ─────────────────────────────────

    /**
     * Compute the row-unit region of a paginating section from its row_block elements: {@code
     * [startYmm, strideMm]} where startY is the topmost row_block frame Y and stride is the unit's
     * full vertical extent (max(y+height) − min(y)). Returns null when the section has no row_block
     * with usable geometry.
     */
    public static float[] computeRowRegion(JsonNode section) {
        return SectionGeometry.computeRowRegion(section);
    }

    /**
     * Height-derived row capacity: how many whole row units fit between the topmost row_block and
     * the section's bottom edge ({@code section.y + section.height}). Returns -1 when the geometry
     * is not computable, so callers can fall back to their legacy default.
     */
    public static int computeRowCapacity(JsonNode section) {
        return SectionGeometry.computeRowCapacity(section);
    }
}
