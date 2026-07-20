package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;

/**
 * Renders {@code multi_row_table} sections where each logical data record spans multiple physical
 * rows (rowUnitSize).
 *
 * <p>Pagination (issue #55) honors {@code splitPolicy}:
 *
 * <ul>
 *   <li>{@code forbidden} (default) — unit-based: a logical unit never splits across pages;
 *       capacity is whole units per page.
 *   <li>{@code allowed-between-rows} / {@code allowed-inside-unit} — physical row-based: a unit's
 *       rows may straddle a page boundary, so capacity is measured in physical rows ({@code
 *       rowUnitSize} rows per unit).
 * </ul>
 */
final class MultiRowTableSectionRenderer implements SectionPdfRenderer {

    private static final int DEFAULT_UNITS_PER_PAGE = 10;

    @Override
    public String sectionType() {
        return "multi_row_table";
    }

    @Override
    public boolean isPaginating() {
        return true;
    }

    private static boolean allowsSplit(JsonNode section) {
        String policy = PdfUtils.textOf(section, "splitPolicy", "forbidden");
        return "allowed-between-rows".equals(policy) || "allowed-inside-unit".equals(policy);
    }

    private static int rowUnitSize(JsonNode section) {
        int explicit = PdfUtils.intOf(section, "rowUnitSize", 0);
        if (explicit > 0) return explicit;
        int blocks = SectionRenderHelper.sortedRowBlocks(section).size();
        return Math.max(blocks, 1);
    }

    /** Physical rows per page for split mode: floor(available / physical-row height). */
    private static int physicalRowsPerPage(JsonNode section) {
        float[] region = SectionRenderHelper.computeRowRegion(section);
        float available = SectionRenderHelper.computeAvailableHeight(section);
        if (region == null || available <= 0) return DEFAULT_UNITS_PER_PAGE;
        float physRowH = region[1] / rowUnitSize(section);
        if (physRowH <= 0) return DEFAULT_UNITS_PER_PAGE;
        return Math.max(1, (int) Math.floor(available / physRowH));
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
        // Explicit fixed unit count wins
        int fixedRowCount = PdfUtils.intOf(section, "fixedRowCount", 0);
        if (fixedRowCount > 0) return fixedRowCount;
        // Height-derived: whole units fitting inside the section (issue #55)
        int capacity = SectionRenderHelper.computeRowCapacity(section);
        return capacity > 0 ? capacity : DEFAULT_UNITS_PER_PAGE;
    }

    @Override
    public int physicalPages(JsonNode section, JsonNode formData) {
        int records = countRows(section, formData);
        if (records <= 0) return 1;
        if (allowsSplit(section)) {
            int totalPhys = records * rowUnitSize(section);
            int cap = physicalRowsPerPage(section);
            return Math.max(1, (int) Math.ceil((double) totalPhys / cap));
        }
        int rpp = Math.max(rowsPerPage(section), 1);
        return Math.max(1, (int) Math.ceil((double) records / rpp));
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
        boolean repeatHeader =
                section.has("continuationHeader")
                        && section.get("continuationHeader").asBoolean(false);

        if (allowsSplit(section)) {
            renderSplitPage(ctx, section, formData, pageIdx, totalRows, repeatHeader);
            return;
        }

        // ── forbidden (default): unit-based, whole units never split ──
        int startRow = pageIdx * rowsPerPage;
        if (pageIdx > 0 && startRow >= totalRows) return;

        if (pageIdx == 0 || repeatHeader) {
            SectionRenderHelper.renderNonRowElements(ctx, section, formData, ctx.variantCtx());
        }
        float[] region = SectionRenderHelper.computeRowRegion(section);
        float stride = region != null ? region[1] : Float.NaN;
        int endRow = Math.min(startRow + rowsPerPage, totalRows);
        for (int rowIdx = startRow; rowIdx < endRow; rowIdx++) {
            SectionRenderHelper.renderElementsForRow(
                    ctx, section, formData, rowIdx, rowsPerPage, ctx.variantCtx(), stride);
        }
        SectionRenderHelper.renderCarryOverElements(
                ctx, section, formData, startRow, endRow, totalRows);
    }

    /** allowed-between-rows: paginate by physical rows; units may straddle a page. */
    private void renderSplitPage(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            int pageIdx,
            int records,
            boolean repeatHeader) {
        int unitSize = rowUnitSize(section);
        int cap = physicalRowsPerPage(section);
        int totalPhys = records * unitSize;
        int startPhys = pageIdx * cap;
        if (startPhys >= totalPhys) return;
        int endPhys = Math.min(startPhys + cap, totalPhys);

        if (pageIdx == 0 || repeatHeader) {
            SectionRenderHelper.renderNonRowElements(ctx, section, formData, ctx.variantCtx());
        }

        float[] region = SectionRenderHelper.computeRowRegion(section);
        if (region == null) return;
        float physRowH = region[1] / unitSize;
        java.util.List<JsonNode> blocks = SectionRenderHelper.sortedRowBlocks(section);
        if (blocks.isEmpty()) return;

        for (int phys = startPhys; phys < endPhys; phys++) {
            int recordIdx = phys / unitSize;
            int rowWithinUnit = phys % unitSize;
            if (rowWithinUnit >= blocks.size()) continue; // unit has fewer blocks than rowUnitSize
            float y = region[0] + physRowH * (phys - startPhys);
            SectionRenderHelper.renderSplitRow(
                    ctx, blocks.get(rowWithinUnit), formData, recordIdx, y, ctx.variantCtx());
        }
    }
}
