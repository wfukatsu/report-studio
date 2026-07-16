package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

/**
 * Resolves element Y positions for sections with {@code layoutMode: "relative"}.
 *
 * <p>Elements may declare {@code props.layout.anchorTo} (an element id) and
 * {@code props.layout.pushDown} (boolean). When pushDown is true the element's
 * effective Y is computed as:
 * <pre>
 *   effectiveY(el) = effectiveY(anchor) + anchor.frame.height + offsetY
 * </pre>
 * where {@code offsetY} is the delta between the element's nominal Y and the
 * anchor's nominal Y (i.e. the original gap is preserved).
 *
 * <p>Elements without {@code anchorTo} keep their original frame Y.
 *
 * <p>Circular anchor chains are detected via Kahn's algorithm and logged as
 * warnings; elements in a cycle keep their original frame Y.
 *
 * <p>Only called for sections with {@code layoutMode: "relative"}. Absolute
 * sections skip this resolver entirely.
 */
public final class RelativeLayoutResolver {

    private static final Logger log = LoggerFactory.getLogger(RelativeLayoutResolver.class);

    private RelativeLayoutResolver() {}

    /**
     * Given a section's element list, return a map of elementId → computed Y (in mm).
     * Elements not in the map use their original frame.y.
     *
     * @param elements JSON array of elements in the section
     * @return map of elementId → effective Y (mm), only for elements whose Y differs from frame.y
     */
    public static Map<String, Float> resolveEffectiveY(JsonNode elements) {
        if (elements == null || !elements.isArray()) return Map.of();

        // Build id → node and id → anchorId maps
        Map<String, JsonNode> byId = new HashMap<>();
        Map<String, String> anchorOf = new HashMap<>(); // elementId → anchorId (if pushDown)

        for (JsonNode el : elements) {
            String id = PdfUtils.textOf(el, "id", "");
            if (id.isEmpty()) continue;
            byId.put(id, el);

            JsonNode propsNode = el.get("props");
            if (propsNode == null || !propsNode.isObject()) continue;
            JsonNode layout = propsNode.get("layout");
            if (layout == null || !layout.isObject()) continue;
            boolean pushDown = layout.has("pushDown") && layout.get("pushDown").asBoolean(false);
            if (!pushDown) continue;
            String anchorId = layout.has("anchorTo") && layout.get("anchorTo").isTextual()
                    ? layout.get("anchorTo").asText() : "";
            if (!anchorId.isEmpty() && byId.containsKey(anchorId)) {
                anchorOf.put(id, anchorId);
            }
        }

        if (anchorOf.isEmpty()) return Map.of();

        // Topological sort (Kahn's algorithm) to detect cycles
        List<String> topoOrder = topoSort(byId.keySet(), anchorOf);
        Map<String, Float> effectiveY = new HashMap<>();

        for (String id : topoOrder) {
            JsonNode el = byId.get(id);
            float nominalY = nominalY(el);
            String anchorId = anchorOf.get(id);
            if (anchorId == null) {
                // No anchor — keep nominal Y (don't add to map to signal "unchanged")
                continue;
            }
            JsonNode anchor = byId.get(anchorId);
            float anchorNominalY = nominalY(anchor);
            float anchorEffectiveY = effectiveY.getOrDefault(anchorId, anchorNominalY);
            float anchorHeight = frameHeight(anchor);
            float offset = nominalY - anchorNominalY; // preserve original gap
            effectiveY.put(id, anchorEffectiveY + anchorHeight + Math.max(0, offset));
        }

        return effectiveY;
    }

    /**
     * Apply the effective Y map to a copy of an element node.
     * Returns a new node with the Y coordinate overridden (V1 {@code frame.y}
     * or V2 {@code position.y}) if the element has a computed Y; otherwise
     * returns the original node unchanged.
     */
    public static JsonNode applyEffectiveY(JsonNode el, Map<String, Float> effectiveY) {
        String id = PdfUtils.textOf(el, "id", "");
        if (id.isEmpty() || !effectiveY.containsKey(id)) return el;
        return withY(el, effectiveY.get(id));
    }

    private static JsonNode withY(JsonNode el, float y) {
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) {
                ((ObjectNode) frame).put("y", y);
                return copy;
            }
            JsonNode position = copy.get("position");
            if (position != null && position.isObject()) {
                ((ObjectNode) position).put("y", y);
            }
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    // ── Page-overflow pagination (issue #55) ─────────────────────────────

    /** Safety cap on pushdown continuation pages per section. */
    static final int MAX_PUSHDOWN_PAGES = 100;

    /**
     * Paged layout of a relative section: {@code pageOf} maps elementId → the
     * section-local physical page it renders on; {@code pagedY} maps
     * elementId → the Y (mm) it renders at on that page. Elements absent from
     * {@code pageOf} render on page 0 (and, for base-layer sections, repeat on
     * every physical page — unchanged behavior).
     */
    public record PagedLayout(Map<String, Integer> pageOf, Map<String, Float> pagedY, int pageCount) {
        public static final PagedLayout SINGLE_PAGE = new PagedLayout(Map.of(), Map.of(), 1);
    }

    /**
     * Compute the page-overflow layout for a relative section (issue #55).
     *
     * <p>Elements are first positioned via {@link #resolveEffectiveY}. Any
     * element whose resolved Y lands beyond the section's bottom edge — which
     * was previously drawn off-page and lost — is assigned to a continuation
     * page: page {@code k = floor((y - top) / regionHeight)}, rendered at the
     * wrapped position {@code top + (y - top) % regionHeight}. An element that
     * would straddle the bottom edge is promoted to the top of the next page
     * when it fits a page; elements taller than the region stay and clip.
     *
     * <p>Elements that fit within the region keep today's behavior exactly
     * (only their effective Y, if any, is applied).
     *
     * @param elements     the section's element array
     * @param regionTop    section top edge (mm)
     * @param regionHeight section height (mm); non-positive disables paging
     */
    public static PagedLayout paginate(JsonNode elements, float regionTop, float regionHeight) {
        if (elements == null || !elements.isArray() || regionHeight <= 0) {
            return PagedLayout.SINGLE_PAGE;
        }
        Map<String, Float> effectiveY = resolveEffectiveY(elements);
        float regionBottom = regionTop + regionHeight;

        Map<String, Integer> pageOf = new HashMap<>();
        Map<String, Float> pagedY = new HashMap<>(effectiveY);
        int pageCount = 1;

        for (JsonNode el : elements) {
            String id = PdfUtils.textOf(el, "id", "");
            if (id.isEmpty()) continue;
            float y = effectiveY.getOrDefault(id, nominalY(el));
            float h = frameHeight(el);
            float relY = y - regionTop;
            if (relY < 0) continue; // above the region — leave untouched

            int page = (int) Math.floor(relY / regionHeight);
            float wrappedY = regionTop + (relY - page * regionHeight);
            // Straddler promotion: move to the next page top when it would fit a page
            if (wrappedY + h > regionBottom && h <= regionHeight) {
                page++;
                wrappedY = regionTop;
            }
            if (page <= 0) continue; // fits the first page — unchanged behavior

            if (page >= MAX_PUSHDOWN_PAGES) {
                log.warn("Element {} overflows beyond {} pushdown pages; clamping", id, MAX_PUSHDOWN_PAGES);
                page = MAX_PUSHDOWN_PAGES - 1;
                wrappedY = regionTop;
            }
            pageOf.put(id, page);
            pagedY.put(id, wrappedY);
            pageCount = Math.max(pageCount, page + 1);
        }

        if (pageOf.isEmpty() && effectiveY.isEmpty()) return PagedLayout.SINGLE_PAGE;
        return new PagedLayout(pageOf, pagedY, pageCount);
    }

    // ── Private helpers ─────────────────────────────────────────────────

    /** Kahn's topological sort. Returns ids in dependency order (anchors before dependents). */
    private static List<String> topoSort(Set<String> allIds, Map<String, String> anchorOf) {
        // In-degree: how many elements point TO this id as their anchor
        Map<String, Integer> inDegree = new HashMap<>();
        Map<String, List<String>> dependents = new HashMap<>(); // anchorId → [dependentIds]
        for (String id : allIds) {
            inDegree.putIfAbsent(id, 0);
            dependents.putIfAbsent(id, new ArrayList<>());
        }
        for (Map.Entry<String, String> entry : anchorOf.entrySet()) {
            String depId = entry.getKey();
            String anchorId = entry.getValue();
            inDegree.merge(depId, 1, Integer::sum);
            dependents.computeIfAbsent(anchorId, k -> new ArrayList<>()).add(depId);
        }

        Queue<String> queue = new ArrayDeque<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) queue.add(entry.getKey());
        }

        List<String> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            String id = queue.poll();
            order.add(id);
            for (String dep : dependents.getOrDefault(id, List.of())) {
                int deg = inDegree.merge(dep, -1, Integer::sum);
                if (deg == 0) queue.add(dep);
            }
        }

        if (order.size() < allIds.size()) {
            Set<String> inCycle = new HashSet<>(allIds);
            inCycle.removeAll(order);
            log.warn("Circular anchorTo reference detected among elements {}. " +
                     "These elements will use their original frame.y.", inCycle);
        }
        return order;
    }

    /** Element Y in mm — V1 {@code frame.y} or V2 {@code position.y}. */
    private static float nominalY(JsonNode el) {
        if (el == null) return 0f;
        JsonNode frame = el.get("frame");
        if (frame != null && frame.isObject()) return PdfUtils.floatOf(frame, "y");
        JsonNode position = el.get("position");
        return position != null && position.isObject() ? PdfUtils.floatOf(position, "y") : 0f;
    }

    /** Element height in mm — V1 {@code frame.height} or V2 {@code size.height}. */
    private static float frameHeight(JsonNode el) {
        if (el == null) return 0f;
        JsonNode frame = el.get("frame");
        if (frame != null && frame.isObject()) return PdfUtils.floatOf(frame, "height");
        JsonNode size = el.get("size");
        return size != null && size.isObject() ? PdfUtils.floatOf(size, "height") : 0f;
    }
}
