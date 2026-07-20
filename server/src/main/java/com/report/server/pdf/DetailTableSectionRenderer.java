package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;

/**
 * Renders {@code detail_table} sections with pagination. Handles header-row repetition and
 * variable/fixed row-count modes.
 *
 * <p>Rows per page (issue #55): {@code tableMode: "fixed"} + {@code fixedRowCount} wins; otherwise
 * the capacity is derived from the actual geometry — how many row units fit between the topmost
 * row_block and the section's bottom edge — falling back to 10 only when the geometry is unusable.
 */
final class DetailTableSectionRenderer implements SectionPdfRenderer {

    private static final int LEGACY_DEFAULT_ROWS_PER_PAGE = 10;

    @Override
    public String sectionType() {
        return "detail_table";
    }

    @Override
    public boolean isPaginating() {
        return true;
    }

    @Override
    public int countRows(JsonNode section, JsonNode formData) {
        if (formData == null) return 0;
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return 0;
        for (JsonNode el : elements) {
            JsonNode bindingRef = el.get("bindingRef");
            if (bindingRef != null && bindingRef.isTextual()) {
                String ref = bindingRef.asText();
                if (ref.contains("[]")) {
                    String groupName = ref.split("\\[\\]")[0];
                    JsonNode group = formData.get(groupName);
                    if (group != null && group.isArray()) return group.size();
                }
            }
        }
        return 0;
    }

    @Override
    public int rowsPerPage(JsonNode section) {
        String tableMode = PdfUtils.textOf(section, "tableMode", "variable");
        int fixedRowCount = PdfUtils.intOf(section, "fixedRowCount", 0);
        if ("fixed".equals(tableMode) && fixedRowCount > 0) return fixedRowCount;
        int capacity = SectionRenderHelper.computeRowCapacity(section);
        return capacity > 0 ? capacity : LEGACY_DEFAULT_ROWS_PER_PAGE;
    }

    @Override
    public int physicalPages(JsonNode section, JsonNode formData) {
        // Group-aware page count: with groupBy, each group starts a fresh page
        return SectionRenderHelper.buildPagePlan(section, formData, rowsPerPage(section)).size();
    }

    @Override
    public void renderPage(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            SectionRenderHelper helper,
            int pageIdx,
            int rowsPerPage,
            int totalRows)
            throws IOException {
        var plan = SectionRenderHelper.buildPagePlan(section, formData, rowsPerPage);
        // Beyond this section's own pages: draw nothing (other sections may
        // still flow on later physical pages — issue #55)
        if (pageIdx >= plan.size()) return;
        SectionRenderHelper.PageSlice slice = plan.get(pageIdx);

        boolean repeatHeader =
                section.has("repeatHeader") && section.get("repeatHeader").asBoolean(false);

        // Column headers/decorations on the first physical page or when repeatHeader;
        // group headers on the first page of each group (issue #55)
        if (pageIdx == 0 || repeatHeader) {
            SectionRenderHelper.renderNonRowElements(ctx, section, formData, ctx.variantCtx());
        }
        SectionRenderHelper.renderGroupHeader(ctx, section, slice);

        // Render this page's row slice, advancing by the unit stride; each row's
        // Y slot is its position within the slice (group pages start at slot 0)
        float[] region = SectionRenderHelper.computeRowRegion(section);
        float stride = region != null ? region[1] : Float.NaN;
        for (int rowIdx = slice.startRow(); rowIdx < slice.endRow(); rowIdx++) {
            SectionRenderHelper.renderRowAtPosition(
                    ctx,
                    section,
                    formData,
                    rowIdx,
                    rowIdx - slice.startRow(),
                    ctx.variantCtx(),
                    stride);
        }

        // 繰越小計 — carried-forward / to-be-continued totals (issue #55)
        SectionRenderHelper.renderCarryOverElements(
                ctx, section, formData, slice.startRow(), slice.endRow(), totalRows);
    }
}
