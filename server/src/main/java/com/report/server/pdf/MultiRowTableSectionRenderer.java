package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;

/**
 * Renders {@code multi_row_table} sections where each logical data record
 * spans multiple physical rows (rowUnitSize).
 *
 * <p>Pagination (issue #55) is unit-based: capacity per page is derived from
 * the section geometry (how many whole units fit between the topmost
 * row_block and the section bottom), and each record advances by the unit's
 * full extent — so a logical unit never splits across pages. This satisfies
 * {@code splitPolicy: "forbidden"}; the finer-grained
 * {@code allowed-between-rows} / {@code allowed-inside-unit} policies (which
 * would allow partial units at a page break) are not yet implemented and
 * currently behave like {@code forbidden}.
 */
final class MultiRowTableSectionRenderer implements SectionPdfRenderer {

    private static final int DEFAULT_UNITS_PER_PAGE = 10;

    @Override public String sectionType() { return "multi_row_table"; }
    @Override public boolean isPaginating() { return true; }

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
        // Explicit fixed unit count wins
        int fixedRowCount = PdfUtils.intOf(section, "fixedRowCount", 0);
        if (fixedRowCount > 0) return fixedRowCount;
        // Height-derived: whole units fitting inside the section (issue #55)
        int capacity = SectionRenderHelper.computeRowCapacity(section);
        return capacity > 0 ? capacity : DEFAULT_UNITS_PER_PAGE;
    }

    @Override
    public void renderPage(PageContext ctx, JsonNode section, JsonNode formData,
                           SectionRenderHelper helper, int pageIdx, int rowsPerPage, int totalRows)
            throws IOException {
        int startRow = pageIdx * rowsPerPage;
        // Beyond this section's own data: draw nothing (issue #55)
        if (pageIdx > 0 && startRow >= totalRows) return;

        boolean repeatHeader =
                section.has("continuationHeader") && section.get("continuationHeader").asBoolean(false);

        // Render section-level header elements on first page or on continuation pages
        if (pageIdx == 0 || repeatHeader) {
            SectionRenderHelper.renderNonRowElements(ctx, section, formData, ctx.variantCtx());
        }

        // Render logical units for this page's slice, advancing by the unit extent
        float[] region = SectionRenderHelper.computeRowRegion(section);
        float stride = region != null ? region[1] : Float.NaN;
        int endRow = Math.min(startRow + rowsPerPage, totalRows);
        for (int rowIdx = startRow; rowIdx < endRow; rowIdx++) {
            SectionRenderHelper.renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage,
                    ctx.variantCtx(), stride);
        }

        // 繰越小計 — carried-forward / to-be-continued totals (issue #55)
        SectionRenderHelper.renderCarryOverElements(ctx, section, formData, startRow, endRow, totalRows);
    }
}
