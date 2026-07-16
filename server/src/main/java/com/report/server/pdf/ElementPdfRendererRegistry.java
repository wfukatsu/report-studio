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
        // Table and grid elements
        registry.register(new TablePdfRenderer());
        registry.register(new FormGridPdfRenderer());
        registry.register(new FormTablePdfRenderer());
        registry.register(new TextCellPdfRenderer());
        // row_block: no-op — grid lines drawn by table/form_grid, text by text_cell
        registry.register(new ElementPdfRenderer() {
            @Override public String kind() { return "row_block"; }
            @Override public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                                          float w, float h, float pageHeight, PDDocument doc,
                                          Map<String, PDFont> fontCache) { /* no-op */ }
        });
        return registry;
    }
}
