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
    private int pageIndex = -1;
    private int totalPages = 1;

    public PageContext(PDDocument doc, PDRectangle pageSize, Map<String, PDFont> fontCache) {
        this(doc, pageSize, fontCache, VariantContext.empty());
    }

    public PageContext(PDDocument doc, PDRectangle pageSize, Map<String, PDFont> fontCache,
                       VariantContext variantCtx) {
        this.doc = doc;
        this.pageSize = pageSize;
        this.fontCache = fontCache;
        this.variantCtx = variantCtx != null ? variantCtx : VariantContext.empty();
    }

    /** Start a new page. Closes the previous content stream if open. */
    public void newPage() throws IOException {
        if (cs != null) {
            cs.close();
        }
        PDPage page = new PDPage(pageSize);
        doc.addPage(page);
        cs = new PDPageContentStream(doc, page);
        pageIndex++;
    }

    /** Set the total page count (computed before rendering begins). */
    public void setTotalPages(int total) {
        this.totalPages = total;
    }

    /** Check if a section with the given pageScope should render on the current page. */
    public boolean shouldRender(String pageScope) {
        if (pageScope == null || "all".equals(pageScope)) return true;
        if ("first".equals(pageScope)) return pageIndex == 0;
        if ("last".equals(pageScope)) return pageIndex == totalPages - 1;
        return true;
    }

    // ── Accessors ───────────────────────────────────────

    public PDPageContentStream contentStream() { return cs; }
    public PDDocument document() { return doc; }
    public Map<String, PDFont> fontCache() { return fontCache; }
    public VariantContext variantCtx() { return variantCtx; }
    public float pageHeight() { return pageSize.getHeight(); }
    public int pageIndex() { return pageIndex; }
    public int totalPages() { return totalPages; }

    @Override
    public void close() throws IOException {
        if (cs != null) {
            cs.close();
            cs = null;
        }
    }
}
