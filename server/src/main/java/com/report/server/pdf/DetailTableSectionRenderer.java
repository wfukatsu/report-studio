package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;

/**
 * Renders {@code detail_table} sections with pagination.
 * Handles header-row repetition and variable/fixed row-count modes.
 */
final class DetailTableSectionRenderer implements SectionPdfRenderer {

    @Override public String sectionType() { return "detail_table"; }
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
        String tableMode = PdfUtils.textOf(section, "tableMode", "variable");
        int fixedRowCount = PdfUtils.intOf(section, "fixedRowCount", 0);
        if ("fixed".equals(tableMode) && fixedRowCount > 0) return fixedRowCount;
        return 10; // default variable rows per page
    }

    @Override
    public void renderPage(PageContext ctx, JsonNode section, JsonNode formData,
                           SectionRenderHelper helper, int pageIdx, int rowsPerPage, int totalRows)
            throws IOException {
        boolean repeatHeader =
                section.has("repeatHeader") && section.get("repeatHeader").asBoolean(false);

        // Render non-row-block elements (column headers, decorations) on first page or when repeatHeader
        if (pageIdx == 0 || repeatHeader) {
            SectionRenderHelper.renderNonRowElements(ctx, section, formData, ctx.variantCtx());
        }

        // Render data rows for this page's slice
        int startRow = pageIdx * rowsPerPage;
        int endRow = Math.min(startRow + rowsPerPage, totalRows);
        for (int rowIdx = startRow; rowIdx < endRow; rowIdx++) {
            SectionRenderHelper.renderElementsForRow(ctx, section, formData, rowIdx, rowsPerPage, ctx.variantCtx());
        }
    }
}
