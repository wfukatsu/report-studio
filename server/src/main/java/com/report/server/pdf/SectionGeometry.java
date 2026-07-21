package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Section geometry: pushdown layout pagination (issue #55), row_block ordering, and row-region /
 * capacity math. Extracted from SectionRenderHelper (#276) — no behavior change.
 */
final class SectionGeometry {

    private SectionGeometry() {}

    /**
     * Pushdown page-overflow layout of a relative section (issue #55). Absolute sections and
     * sections without a usable height are single-page.
     */
    static RelativeLayoutResolver.PagedLayout pushdownLayout(JsonNode section) {
        if (!"relative".equals(PdfUtils.textOf(section, "layoutMode", "absolute"))) {
            return RelativeLayoutResolver.PagedLayout.SINGLE_PAGE;
        }
        float top = PdfUtils.floatOf(section, "y", 0);
        float height = PdfUtils.floatOf(section, "height", 0);
        return RelativeLayoutResolver.paginate(section.get("elements"), top, height);
    }

    /** row_block elements of a section, sorted top-to-bottom by frame.y. */
    static java.util.List<JsonNode> sortedRowBlocks(JsonNode section) {
        java.util.List<JsonNode> blocks = new java.util.ArrayList<>();
        JsonNode elements = section.get("elements");
        if (elements != null && elements.isArray()) {
            for (JsonNode el : elements) {
                if ("row_block".equals(ElementNodeSupport.resolveKind(el))) blocks.add(el);
            }
        }
        blocks.sort(
                java.util.Comparator.comparingDouble(
                        el -> {
                            JsonNode f = el.get("frame");
                            return f != null ? PdfUtils.floatOf(f, "y") : 0f;
                        }));
        return blocks;
    }

    /** Available vertical space (mm) from the topmost row_block to the section bottom, or -1. */
    static float computeAvailableHeight(JsonNode section) {
        float[] region = computeRowRegion(section);
        if (region == null) return -1;
        float sectionY = PdfUtils.floatOf(section, "y", 0);
        float sectionH = PdfUtils.floatOf(section, "height", 0);
        if (sectionH <= 0) return -1;
        return sectionY + sectionH - region[0];
    }

    /**
     * Compute the row-unit region of a paginating section from its row_block elements: {@code
     * [startYmm, strideMm]} where startY is the topmost row_block frame Y and stride is the unit's
     * full vertical extent (max(y+height) − min(y)). Returns null when the section has no row_block
     * with usable geometry.
     */
    static float[] computeRowRegion(JsonNode section) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return null;
        float minY = Float.MAX_VALUE;
        float maxBottom = -Float.MAX_VALUE;
        for (JsonNode el : elements) {
            if (!"row_block".equals(ElementNodeSupport.resolveKind(el))) continue;
            JsonNode frame = el.get("frame");
            if (frame == null) continue;
            float y = PdfUtils.floatOf(frame, "y");
            float h = PdfUtils.floatOf(frame, "height");
            minY = Math.min(minY, y);
            maxBottom = Math.max(maxBottom, y + h);
        }
        if (minY == Float.MAX_VALUE || maxBottom <= minY) return null;
        return new float[] {minY, maxBottom - minY};
    }

    /**
     * Height-derived row capacity: how many whole row units fit between the topmost row_block and
     * the section's bottom edge ({@code section.y + section.height}). Returns -1 when the geometry
     * is not computable, so callers can fall back to their legacy default.
     */
    static int computeRowCapacity(JsonNode section) {
        float[] region = computeRowRegion(section);
        if (region == null) return -1;
        float sectionY = PdfUtils.floatOf(section, "y", 0);
        float sectionH = PdfUtils.floatOf(section, "height", 0);
        if (sectionH <= 0) return -1;
        float available = sectionY + sectionH - region[0];
        if (available < region[1]) return 1;
        return (int) Math.floor(available / region[1]);
    }
}
