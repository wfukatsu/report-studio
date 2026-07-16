package com.report.server.pdf;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.io.IOException;
import java.util.Map;

/**
 * Mutable rendering context that tracks the current page and content stream.
 * Manages page breaks and shared resources (fonts, images) across pages.
 *
 * <p>A PDPageContentStream is bound to exactly one page. This class handles
 * closing the old stream before opening a new one for the next page.
 */
public final class PageContext implements AutoCloseable {

    private final PDDocument doc;
    private final PDRectangle pageSize;
    private final Map<String, PDFont> fontCache;
    private final VariantContext variantCtx;

    private PDPageContentStream cs;
    private PDRectangle currentPageSize;
    private int pageIndex = -1;      // global physical page index (for page numbers)
    private int totalPages = 1;      // global physical page count
    private int localPageIndex = -1; // index within the current designed page's flow
    private int localPageCount = 1;  // physical pages of the current designed page
    private java.time.LocalDate printDate = java.time.LocalDate.now();
    private com.fasterxml.jackson.databind.JsonNode tenant;

    public PageContext(PDDocument doc, PDRectangle pageSize, Map<String, PDFont> fontCache) {
        this(doc, pageSize, fontCache, VariantContext.empty());
    }

    public PageContext(PDDocument doc, PDRectangle pageSize, Map<String, PDFont> fontCache,
                       VariantContext variantCtx) {
        this.doc = doc;
        this.pageSize = pageSize;
        this.currentPageSize = pageSize;
        this.fontCache = fontCache;
        this.variantCtx = variantCtx != null ? variantCtx : VariantContext.empty();
    }

    /** Start a new page at the context's default size. */
    public void newPage() throws IOException {
        newPage(pageSize);
    }

    /**
     * Start a new page at an explicit size (issue #52 — V2 designed pages each
     * carry their own dimensions). Closes the previous content stream if open.
     * {@link #pageHeight()} reflects the current page for coordinate flipping.
     */
    public void newPage(PDRectangle size) throws IOException {
        if (cs != null) {
            cs.close();
        }
        PDPage page = new PDPage(size);
        doc.addPage(page);
        cs = new PDPageContentStream(doc, page);
        currentPageSize = size;
        pageIndex++;
    }

    /** Set the total page count (computed before rendering begins). */
    public void setTotalPages(int total) {
        this.totalPages = total;
    }

    /**
     * Set the local page position within the current designed page's flow
     * (issue #52). {@code pageScope} first/last is evaluated against this, so a
     * "last" section renders on the last physical page of its own designed
     * page, not the last page of the whole document. The V1 path sets these
     * equal to the global index/count, preserving prior behavior.
     */
    public void setLocalPage(int localIndex, int localCount) {
        this.localPageIndex = localIndex;
        this.localPageCount = localCount;
    }

    /** Override the print date (from the projection's {@code _printDate}); defaults to today. */
    public void setPrintDate(java.time.LocalDate date) {
        if (date != null) this.printDate = date;
    }

    /** Set the tenant info document used by tenant* elements (may be null). */
    public void setTenant(com.fasterxml.jackson.databind.JsonNode tenant) {
        this.tenant = tenant;
    }

    /** Check if a section with the given pageScope should render on the current page. */
    public boolean shouldRender(String pageScope) {
        if (pageScope == null || "all".equals(pageScope)) return true;
        if ("first".equals(pageScope)) return localPageIndex <= 0;
        if ("last".equals(pageScope)) return localPageIndex == localPageCount - 1;
        return true;
    }

    // ── Accessors ───────────────────────────────────────

    public PDPageContentStream contentStream() { return cs; }
    public PDDocument document() { return doc; }
    public Map<String, PDFont> fontCache() { return fontCache; }
    public VariantContext variantCtx() { return variantCtx; }
    public float pageHeight() { return currentPageSize.getHeight(); }
    public int pageIndex() { return pageIndex; }
    public int totalPages() { return totalPages; }
    public java.time.LocalDate printDate() { return printDate; }
    public com.fasterxml.jackson.databind.JsonNode tenant() { return tenant; }

    @Override
    public void close() throws IOException {
        if (cs != null) {
            cs.close();
            cs = null;
        }
    }
}
