package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.pdf.ElementPdfRenderer;
import com.report.server.pdf.ElementPdfRendererRegistry;
import com.report.server.pdf.ImagePdfRenderer;
import com.report.server.pdf.PdfUtils;
import com.report.server.pdf.SectionPdfRenderer;
import com.report.server.pdf.SectionPdfRendererRegistry;
import com.report.server.pdf.VariantContext;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Renders a designer projection JSON to a PDF document using Apache PDFBox.
 * Delegates element rendering to the ElementPdfRendererRegistry (registry pattern).
 *
 * Uses mm coordinates from the projection, converting to PDF points (1mm = 2.835pt).
 */
public final class PdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(PdfRenderer.class);
    private static final float MM_TO_PT = 2.835f;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_TEMPLATES_PER_PROJECTION = 20;

    private static final ElementPdfRendererRegistry REGISTRY = ElementPdfRendererRegistry.createDefault();
    private static final ElementPdfRenderer FALLBACK = new FallbackRenderer();
    private static final SectionPdfRendererRegistry SECTION_REGISTRY = SectionPdfRendererRegistry.createDefault();

    private PdfRenderer() {}

    /**
     * Render projection JSON to PDF bytes.
     *
     * @param projectionJson raw JSON string from designer_projections table
     * @return PDF file as byte array
     */
    public static byte[] render(String projectionJson) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        renderToStream(projectionJson, baos);
        return baos.toByteArray();
    }

    /**
     * Render projection JSON directly to an OutputStream (no intermediate byte[]).
     * Preferred for batch use to avoid heap pressure.
     */
    public static void renderToStream(String projectionJson, java.io.OutputStream out) throws IOException {
        JsonNode root = MAPPER.readTree(projectionJson);
        JsonNode templates = root.get("templates");

        // Optional _formData: { "company.name": "value", "income": [{"amount": 100}, ...] }
        JsonNode formData = root.get("_formData");

        // Optional _variantId: selects a variant from the template's "variants" array
        String variantId = root.has("_variantId") ? root.get("_variantId").asText(null) : null;

        // Optional _printDate (ISO yyyy-MM-dd): overrides "today" for currentDate
        // elements and {currentDate} bindings — keeps batch output deterministic (issue #54)
        java.time.LocalDate printDate = null;
        if (root.hasNonNull("_printDate")) {
            try {
                printDate = java.time.LocalDate.parse(root.get("_printDate").asText());
            } catch (Exception e) {
                log.warn("Invalid _printDate '{}', using today", root.get("_printDate").asText());
            }
        }

        // Tenant info for tenant* elements: projection-level _tenant overrides
        // the process-wide provider (issue #54)
        JsonNode tenant = root.hasNonNull("_tenant")
                ? root.get("_tenant") : TenantInfoProvider.get();

        try (PDDocument doc = new PDDocument()) {
            if (templates == null || !templates.isArray() || templates.isEmpty()) {
                doc.addPage(new PDPage(PDRectangle.A4));
            } else {
                int tmplCount = 0;
                for (JsonNode tmpl : templates) {
                    if (++tmplCount > MAX_TEMPLATES_PER_PROJECTION) {
                        log.warn("Template count exceeds limit ({}), truncating", MAX_TEMPLATES_PER_PROJECTION);
                        break;
                    }
                    renderTemplate(doc, tmpl, formData, variantId, printDate, tenant);
                }
            }

            doc.save(out);
        }
    }

    private static void renderTemplate(PDDocument doc, JsonNode tmpl, JsonNode formData,
                                        String variantId, java.time.LocalDate printDate,
                                        JsonNode tenant) throws IOException {
        // Clear per-render image cache at template boundary
        ImagePdfRenderer.clearImageCache();

        // Resolve variant context
        VariantContext variantCtx = VariantContext.empty();
        if (variantId != null && !variantId.isBlank()) {
            JsonNode variants = tmpl.path("variants");
            if (variants.isArray()) {
                for (JsonNode v : variants) {
                    if (variantId.equals(v.path("variantId").asText(null))) {
                        variantCtx = VariantContext.from(v);
                        break;
                    }
                }
            }
        }

        PDRectangle pageSize = resolvePageSize(tmpl);
        JsonNode sections = tmpl.get("sections");
        if (sections == null || !sections.isArray()) {
            doc.addPage(new PDPage(pageSize));
            return;
        }

        // Per-section pagination (issue #55): every paginating section computes
        // its own rows-per-page and row count; the document's page count is the
        // max across sections, and each section flows independently.
        java.util.List<JsonNode> orderedSections = new java.util.ArrayList<>();
        java.util.List<int[]> sectionParams = new java.util.ArrayList<>(); // {rowsPerPage, totalRows}
        int totalPages = 1;

        for (JsonNode section : sections) {
            orderedSections.add(section);
            String sectionType = resolveSectionType(section);
            SectionPdfRenderer renderer = SECTION_REGISTRY.getOrFallback(sectionType);
            int rowsPerPage = 10;
            int totalRows = 0;
            if (renderer.isPaginating()) {
                rowsPerPage = Math.max(renderer.rowsPerPage(section), 1);
                totalRows = (formData != null) ? renderer.countRows(section, formData) : 0;
                if (totalRows > rowsPerPage) {
                    totalPages = Math.max(totalPages,
                            (int) Math.ceil((double) totalRows / rowsPerPage));
                }
            }
            sectionParams.add(new int[]{rowsPerPage, totalRows});
        }

        Map<String, PDFont> fontCache = new HashMap<>();

        try (com.report.server.pdf.PageContext ctx =
                 new com.report.server.pdf.PageContext(doc, pageSize, fontCache, variantCtx)) {
            ctx.setTotalPages(totalPages);
            ctx.setPrintDate(printDate);
            ctx.setTenant(tenant);

            for (int pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                ctx.newPage();
                for (int i = 0; i < orderedSections.size(); i++) {
                    JsonNode section = orderedSections.get(i);
                    String sectionType = resolveSectionType(section);
                    SectionPdfRenderer renderer = SECTION_REGISTRY.getOrFallback(sectionType);
                    int[] params = sectionParams.get(i);
                    renderer.renderPage(ctx, section, formData, null,
                            pageIdx, params[0], params[1]);
                }
            }
        }
    }

    // ── Fallback renderer for unsupported kinds ─────────────────────
    private static final class FallbackRenderer implements ElementPdfRenderer {
        @Override
        public String kind() { return "__fallback__"; }

        @Override
        public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                           float w, float h, float pageHeight, PDDocument doc,
                           Map<String, PDFont> fontCache) throws IOException {
            PdfUtils.renderBorder(cs, x, y, w, h);
        }
    }

    // ── Section type resolution ────────────────────────────────────────
    /** V1 uses "type"; V2 uses "sectionType" — fall back accordingly. */
    private static String resolveSectionType(JsonNode section) {
        String type = PdfUtils.textOf(section, "type", "");
        if (!type.isEmpty()) return type;
        String sectionType = PdfUtils.textOf(section, "sectionType", "");
        // V2 "body" sections render all elements like V1 "page_base"
        if ("body".equals(sectionType)) return "page_base";
        return sectionType.isEmpty() ? "page_base" : sectionType;
    }

    // ── Page size resolution ─────────────────────────────────────────
    private static PDRectangle resolvePageSize(JsonNode tmpl) {
        JsonNode ps = tmpl.get("pageSetup");
        if (ps != null) {
            String kind = PdfUtils.textOf(ps, "kind", "preset");
            if ("preset".equals(kind)) {
                String id = PdfUtils.textOf(ps, "paperSizeId", "A4");
                String orient = PdfUtils.textOf(ps, "orientation", "portrait");
                PDRectangle base = switch (id) {
                    case "A3" -> PDRectangle.A3;
                    case "A5" -> PDRectangle.A5;
                    case "Letter" -> PDRectangle.LETTER;
                    case "Legal" -> PDRectangle.LEGAL;
                    default -> PDRectangle.A4;
                };
                return "landscape".equals(orient) ? new PDRectangle(base.getHeight(), base.getWidth()) : base;
            } else {
                float w = Math.min(PdfUtils.floatOf(ps, "customWidthMm", 210), 1000) * MM_TO_PT;
                float h = Math.min(PdfUtils.floatOf(ps, "customHeightMm", 297), 1000) * MM_TO_PT;
                return new PDRectangle(w, h);
            }
        }
        return PDRectangle.A4;
    }
}
