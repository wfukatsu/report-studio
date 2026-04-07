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
     * Returns a new node with frame.y overridden if the element has a computed Y;
     * otherwise returns the original node unchanged.
     */
    public static JsonNode applyEffectiveY(JsonNode el, Map<String, Float> effectiveY) {
        String id = PdfUtils.textOf(el, "id", "");
        if (id.isEmpty() || !effectiveY.containsKey(id)) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) {
                ((ObjectNode) frame).put("y", effectiveY.get(id));
            }
            return copy;
        } catch (Exception e) {
            return el;
        }
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

    private static float nominalY(JsonNode el) {
        JsonNode frame = el == null ? null : el.get("frame");
        return frame != null ? PdfUtils.floatOf(frame, "y") : 0f;
    }

    private static float frameHeight(JsonNode el) {
        JsonNode frame = el == null ? null : el.get("frame");
        return frame != null ? PdfUtils.floatOf(frame, "height") : 0f;
    }
}
