package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * V2 band flow planning (issue #64): per-page record capacity and windowing for repeatingBand /
 * repeatingList elements. Extracted from SectionRenderHelper (#276) — no behavior change.
 */
final class BandFlowPlanner {

    /** Safety cap on band continuation pages per section. */
    static final int MAX_BAND_PAGES = 200;

    private BandFlowPlanner() {}

    /**
     * Records per page a repeatingBand / repeatingList element can hold, or 0 when the element
     * cannot flow (no usable geometry; list layouts other than vertical keep the historical clip
     * behavior).
     */
    static int bandCapacity(JsonNode el) {
        String kind = ElementNodeSupport.resolveKind(el);
        float heightMm = ElementNodeSupport.elementHeightMm(el);
        if (heightMm <= 0) return 0;
        if ("repeatingBand".equals(kind)) {
            float rowH = PdfUtils.elementFloatOf(el, "itemHeight", 6f);
            if (rowH <= 0) return 0;
            boolean showHeader = PdfUtils.elementBoolOf(el, "showHeader", true);
            float headerH = showHeader ? PdfUtils.elementFloatOf(el, "headerHeight", rowH) : 0;
            return Math.max((int) Math.floor((heightMm - headerH) / rowH), 0);
        }
        if ("repeatingList".equals(kind)) {
            String layout = PdfUtils.elementTextOf(el, "layout", "vertical");
            if (!"vertical".equals(layout)) return 0;
            float itemH = PdfUtils.elementFloatOf(el, "itemHeight", 20f);
            if (itemH <= 0) return 0;
            float gap = Math.max(PdfUtils.elementFloatOf(el, "gap", 2f), 0);
            return Math.max((int) Math.floor((heightMm + gap) / (itemH + gap)), 0);
        }
        return 0;
    }

    /**
     * Section-local pages needed to flow every band element's bound records (issue #64). Records
     * dropped by {@code maxItems} are an explicit designer choice and do not flow.
     */
    static int bandFlowPages(JsonNode section, JsonNode formData) {
        if (formData == null) return 1;
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return 1;
        int pages = 1;
        for (JsonNode el : elements) {
            String kind = ElementNodeSupport.resolveKind(el);
            if (!"repeatingBand".equals(kind) && !"repeatingList".equals(kind)) continue;
            int capacity = bandCapacity(el);
            if (capacity <= 0) continue;
            String key = PdfUtils.elementTextOf(el, "dataSource", "");
            JsonNode records = key.isEmpty() ? null : formData.get(key);
            if (records == null || !records.isArray()) continue;
            int maxItems = PdfUtils.elementIntOf(el, "maxItems", 0);
            int intended = maxItems > 0 ? Math.min(records.size(), maxItems) : records.size();
            int needed = Math.min((intended + capacity - 1) / capacity, MAX_BAND_PAGES);
            pages = Math.max(pages, needed);
        }
        return pages;
    }

    /**
     * Window a band element's resolved records to the given section-local page (issue #64): page k
     * draws records {@code [k*capacity, (k+1)*capacity)} of the maxItems-capped set. Returns the
     * element unchanged when it cannot flow, or null when the element has no records on this page.
     */
    static JsonNode applyBandWindow(JsonNode el, int pageIdx) {
        String kind = ElementNodeSupport.resolveKind(el);
        if (!"repeatingBand".equals(kind) && !"repeatingList".equals(kind)) return el;
        int capacity = bandCapacity(el);
        if (capacity <= 0) return el; // non-flowing: historical clip behavior on every page
        JsonNode props = el.get("props");
        JsonNode data = props != null ? props.get("data") : null;
        if (data == null || !data.isArray()) return el;

        int maxItems = PdfUtils.elementIntOf(el, "maxItems", 0);
        int intended = maxItems > 0 ? Math.min(data.size(), maxItems) : data.size();
        int start = pageIdx * capacity;
        if (pageIdx > 0 && start >= intended) return null; // no records left for this page
        int end = Math.min(start + capacity, intended);
        if (start == 0 && end == data.size() && maxItems == 0) return el; // whole set fits page 0

        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode propsCopy = (ObjectNode) copy.get("props");
            var slice = ElementNodeSupport.MAPPER.createArrayNode();
            for (int i = start; i < end; i++) slice.add(data.get(i).deepCopy());
            propsCopy.set("data", slice);
            // The window already applied maxItems — stop the renderer re-truncating
            copy.put("maxItems", 0);
            if (copy.has("props") && copy.get("props").has("maxItems")) {
                ((ObjectNode) copy.get("props")).put("maxItems", 0);
            }
            return copy;
        } catch (Exception e) {
            return el;
        }
    }
}
