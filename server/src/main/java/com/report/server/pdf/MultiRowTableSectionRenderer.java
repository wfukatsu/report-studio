package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;

/**
 * Renders {@code multi_row_table} sections where each logical data record
 * spans multiple physical rows (rowUnitSize).
 *
 * <p>The {@code splitPolicy} field controls page-break behaviour:
 * <ul>
 *   <li>{@code forbidden} — a logical unit never splits across pages</li>
 *   <li>{@code allowed-between-rows} — split between the physical rows of a unit</li>
 *   <li>{@code allowed-inside-unit} — split even inside a physical row</li>
 * </ul>
 *
 * <p>Phase 1a implements the core paginating render loop. Split-policy enforcement
 * (keeping units together across page boundaries) is applied in future refinements.
 */
final class MultiRowTableSectionRenderer implements SectionPdfRenderer {

    private static final int DEFAULT_ROW_UNIT_SIZE = 1;
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
        // Express capacity in logical records per page
        int rowUnitSize = PdfUtils.intOf(section, "rowUnitSize", DEFAULT_ROW_UNIT_SIZE);
        if (rowUnitSize <= 0) rowUnitSize = DEFAULT_ROW_UNIT_SIZE;
        // Use fixed row count if specified, otherwise default capacity
        int fixedRowCount = PdfUtils.intOf(section, "fixedRowCount", 0);
        if (fixedRowCount > 0) return fixedRowCount;
        return DEFAULT_UNITS_PER_PAGE;
    }

    @Override
    public void renderPage(PageContext ctx, JsonNode section, JsonNode formData,
                           SectionRenderHelper helper, int pageIdx, int rowsPerPage, int totalRows)
            throws IOException {
        boolean repeatHeader =
                section.has("continuationHeader") && section.get("continuationHeader").asBoolean(false);

        // Render section-level header elements on first page or on continuation pages
        if (pageIdx == 0 || repeatHeader) {
            SectionRenderHelper.renderNonRowElements(ctx, section, formData, ctx.variantCtx());
        }

        // Render logical rows for this page's slice
        int startRow = pageIdx * rowsPerPage;
        int endRow = Math.min(startRow + rowsPerPage, totalRows);
        for (int rowIdx = startRow; rowIdx < endRow; rowIdx++) {
            SectionRenderHelper.renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage, ctx.variantCtx());
        }
    }
}
