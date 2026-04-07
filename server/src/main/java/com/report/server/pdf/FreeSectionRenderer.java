package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;

/**
 * Renders {@code free} and {@code repeat} sections: free-form content with
 * optional {@code pageScope} filtering. No pagination logic.
 */
final class FreeSectionRenderer implements SectionPdfRenderer {

    private final String type;

    FreeSectionRenderer(String type) { this.type = type; }

    @Override public String sectionType() { return type; }
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
