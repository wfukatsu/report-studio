package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;

/**
 * Interface for section-type-specific PDF rendering. Each implementation handles one section type
 * (page_base, detail_table, etc.).
 *
 * <p>Mirrors the ElementPdfRendererRegistry pattern — add a new section type by creating a new
 * implementation and registering it in SectionPdfRendererRegistry.
 */
public interface SectionPdfRenderer {

    /** The section type value this renderer handles (e.g., "page_base", "multi_row_table"). */
    String sectionType();

    /**
     * Whether this section type drives pagination (determines total page count). At most one
     * paginating section per template is used for page count calculation.
     */
    boolean isPaginating();

    /**
     * Count the number of logical data rows for this section (only called when isPaginating()).
     *
     * @param section JSON node of the section
     * @param formData optional form data node (may be null)
     * @return total logical row count, or 0 if no data
     */
    int countRows(JsonNode section, JsonNode formData);

    /**
     * Return the number of logical rows that fit on one page (only called when isPaginating()).
     *
     * @param section JSON node of the section
     * @return rows per page (must be &gt; 0)
     */
    int rowsPerPage(JsonNode section);

    /**
     * Number of physical pages this section needs for its data (issue #55). Default is {@code
     * ceil(rows / rowsPerPage)}; a section that forces page breaks at group boundaries ({@code
     * groupBy}) overrides this so each group starts on a fresh page. Only meaningful when {@link
     * #isPaginating()}.
     */
    default int physicalPages(JsonNode section, JsonNode formData) {
        int rows = countRows(section, formData);
        int rpp = Math.max(rowsPerPage(section), 1);
        return rows > rpp ? (int) Math.ceil((double) rows / rpp) : 1;
    }

    /**
     * Render this section onto the current page.
     *
     * @param ctx current page context (content stream, page dimensions, page index)
     * @param section JSON node of the section
     * @param formData optional form data node (may be null)
     * @param helper shared element-rendering utilities
     * @param pageIdx zero-based index of the current page
     * @param rowsPerPage rows that fit on one page (relevant for paginating sections)
     * @param totalRows total logical row count (relevant for paginating sections)
     */
    void renderPage(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            SectionRenderHelper helper,
            int pageIdx,
            int rowsPerPage,
            int totalRows)
            throws IOException;
}
