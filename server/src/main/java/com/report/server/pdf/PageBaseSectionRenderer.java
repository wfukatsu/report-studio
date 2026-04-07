package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;

/**
 * Renders {@code page_base} sections: fixed-position content visible on
 * all, first, or last pages based on the section's {@code pageScope} field.
 */
final class PageBaseSectionRenderer implements SectionPdfRenderer {

    @Override
    public String sectionType() { return "page_base"; }

    @Override public boolean isPaginating() { return false; }
    @Override public int countRows(JsonNode section, JsonNode formData) { return 0; }
    @Override public int rowsPerPage(JsonNode section) { return 1; }

    @Override
    public void renderPage(PageContext ctx, JsonNode section, JsonNode formData,
                           SectionRenderHelper helper, int pageIdx, int rowsPerPage, int totalRows)
            throws IOException {
        String pageScope = PdfUtils.textOf(section, "pageScope", "all");
        if (!ctx.shouldRender(pageScope)) return;
        SectionRenderHelper.renderElements(ctx, section, formData, ctx.variantCtx());
    }
}
