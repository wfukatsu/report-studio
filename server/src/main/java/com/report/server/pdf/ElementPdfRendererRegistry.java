package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Registry of element-kind-specific PDF renderers.
 * Mirrors the frontend ElementRegistry pattern.
 */
public final class ElementPdfRendererRegistry {

    private final Map<String, ElementPdfRenderer> handlers = new HashMap<>();

    public void register(ElementPdfRenderer renderer) {
        handlers.put(renderer.kind(), renderer);
    }

    public Optional<ElementPdfRenderer> get(String kind) {
        return Optional.ofNullable(handlers.get(kind));
    }

    /** Create a registry pre-loaded with all built-in renderers. */
    public static ElementPdfRendererRegistry createDefault() {
        ElementPdfRendererRegistry registry = new ElementPdfRendererRegistry();
        registry.register(new TextPdfRenderer());
        registry.register(new ShapePdfRenderer());
        registry.register(new LinePdfRenderer());
        registry.register(new BarcodePdfRenderer());
        registry.register(new QrCodePdfRenderer());
        registry.register(new ImagePdfRenderer());
        // Check elements
        registry.register(new CheckPdfRenderer("check_mark"));
        registry.register(new CheckPdfRenderer("checkbox"));
        registry.register(new CheckPdfRenderer("radio_mark"));
        // Seal and signature
        registry.register(new SealBoxPdfRenderer("seal_box"));
        registry.register(new SealBoxPdfRenderer("signature_line"));
        // V2 Japanese-form elements (issue #53)
        registry.register(new HankoPdfRenderer());
        registry.register(new DividerPdfRenderer());
        registry.register(new RevenueStampPdfRenderer());
        registry.register(new ApprovalStampRowPdfRenderer());
        registry.register(new EraSelectPdfRenderer());
        registry.register(new DataFieldPdfRenderer());
        registry.register(new ManualEntryPdfRenderer());
        registry.register(new ChartPdfRenderer());
        registry.register(new RepeatingBandPdfRenderer());
        registry.register(new RepeatingListPdfRenderer());
        // Auto-fields — values resolved from the page context (issue #54)
        registry.register(new StyledTextPdfRenderer("pageNumber"));
        registry.register(new StyledTextPdfRenderer("currentDate"));
        // Tenant fields — values resolved from the TenantInfo document (issue #54);
        // tenantLogo is rewritten to an image element in SectionRenderHelper
        registry.register(new StyledTextPdfRenderer("tenantCompanyName"));
        registry.register(new StyledTextPdfRenderer("tenantAddress"));
        registry.register(new StyledTextPdfRenderer("tenantPhone"));
        registry.register(new StyledTextPdfRenderer("tenantRepresentative"));
        registry.register(new StyledTextPdfRenderer("tenantCustom"));
        // tenantLogo reaches the registry only when no logo is configured
        // (with a logo it is rewritten to "image") — draw nothing, not a fallback box
        registry.register(new ElementPdfRenderer() {
            @Override public String kind() { return "tenantLogo"; }
            @Override public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                                          float w, float h, float pageHeight, PDDocument doc,
                                          Map<String, PDFont> fontCache) { /* no logo configured */ }
        });
        // Table and grid elements
        registry.register(new TablePdfRenderer());
        registry.register(new FormGridPdfRenderer());
        registry.register(new FormTablePdfRenderer());
        registry.register(new TextCellPdfRenderer());
        // row_block: per-row text of detail/multi-row table sections (issue #55)
        registry.register(new RowBlockPdfRenderer());
        // Carry-over totals + group headers — text injected per page by the
        // section renderer (issue #55)
        registry.register(new StyledTextPdfRenderer("carryover_header"));
        registry.register(new StyledTextPdfRenderer("carryover_footer"));
        registry.register(new StyledTextPdfRenderer("group_header"));
        return registry;
    }
}
