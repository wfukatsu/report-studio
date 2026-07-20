package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Registry of section-type-specific PDF renderers. Mirrors the ElementPdfRendererRegistry pattern
 * for section-level dispatch.
 *
 * <p>Add support for a new section type by creating a {@link SectionPdfRenderer} implementation and
 * registering it in {@link #createDefault()}. Unknown section types fall back to {@link
 * FreeSectionRenderer} with a warning log.
 */
public final class SectionPdfRendererRegistry {

    private static final Logger log = LoggerFactory.getLogger(SectionPdfRendererRegistry.class);

    private final Map<String, SectionPdfRenderer> handlers = new HashMap<>();

    public void register(SectionPdfRenderer renderer) {
        handlers.put(renderer.sectionType(), renderer);
    }

    /** Look up a renderer by section type. Returns empty if not registered. */
    public Optional<SectionPdfRenderer> get(String sectionType) {
        return Optional.ofNullable(handlers.get(sectionType));
    }

    /**
     * Look up a renderer, falling back to the free-section renderer for unknown types. Logs a
     * warning on the first encounter of an unknown type to aid debugging during rollback.
     */
    public SectionPdfRenderer getOrFallback(String sectionType) {
        SectionPdfRenderer renderer = handlers.get(sectionType);
        if (renderer != null) return renderer;
        log.warn(
                "Unknown section type '{}' — falling back to free-section renderer. "
                        + "This may indicate a rollback or forward-compatibility scenario.",
                sectionType);
        return handlers.get("free");
    }

    /** Count data rows for a paginating section, returning 0 for non-paginating types. */
    public int countRows(String sectionType, JsonNode section, JsonNode formData) {
        SectionPdfRenderer renderer = handlers.get(sectionType);
        if (renderer == null || !renderer.isPaginating()) return 0;
        return renderer.countRows(section, formData);
    }

    /** Create a registry pre-loaded with all built-in section renderers. */
    public static SectionPdfRendererRegistry createDefault() {
        SectionPdfRendererRegistry registry = new SectionPdfRendererRegistry();
        registry.register(new PageBaseSectionRenderer());
        registry.register(new DetailTableSectionRenderer());
        registry.register(new FreeSectionRenderer("free"));
        registry.register(new FreeSectionRenderer("repeat"));
        registry.register(new MultiRowTableSectionRenderer());
        return registry;
    }
}
