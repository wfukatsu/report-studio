package com.report.server;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CalculationEngine — evaluates CalculationRules from a template projection.
 *
 * <p>Rules are evaluated in topological order (Kahn's algorithm, O(V+E)).
 * Circular dependencies throw {@link CircularDependencyException} → callers return HTTP 422.
 *
 * <p>Output: an enriched {@code Map<String, Object>} of formData with computed field values
 * merged in. The original JsonNode is not modified.
 */
public final class CalculationEngine {

    private static final Logger log = LoggerFactory.getLogger(CalculationEngine.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    /** Pattern to extract variable references from JEXL expressions (simple identifier scan). */
    private static final Pattern IDENT = Pattern.compile("[a-zA-Z_][a-zA-Z0-9_]*");

    private CalculationEngine() {}

    /**
     * Apply all CalculationRules in the projection to the given form data.
     *
     * @param projection  the full projection JSON (templates[].calculationRules)
     * @param formData    the base form data (may be null)
     * @return            a mutable map of formData enriched with computed fields
     * @throws CircularDependencyException if rules form a cycle
     * @throws ExpressionTimeoutException  if any expression evaluation times out
     */
    public static Map<String, Object> apply(JsonNode projection, JsonNode formData) {
        Map<String, Object> context = formDataToMap(formData);

        List<CalcRule> rules = extractRules(projection);
        if (rules.isEmpty()) return context;

        List<CalcRule> ordered = topologicalSort(rules);

        for (CalcRule rule : ordered) {
            Object value = ExpressionEngine.calculate(rule.expression(), context);
            if (value != null) {
                value = applyRounding(value, rule.roundingPolicy(), rule.roundingScale());
            }
            context.put(rule.targetField(), value);
        }

        return context;
    }

    // ── Rule extraction ───────────────────────────────────────────────────────

    private record CalcRule(String id, String targetField, String expression,
                            String roundingPolicy, int roundingScale) {}

    private static List<CalcRule> extractRules(JsonNode projection) {
        List<CalcRule> rules = new ArrayList<>();
        JsonNode templates = projection.path("templates");
        if (templates.isArray()) {
            // V1 projection: templates[].calculationRules[]
            for (JsonNode tmpl : templates) {
                collectRules(tmpl.path("calculationRules"), rules);
            }
        } else {
            // V2 ReportDefinition: calculationRules[] at the root (issue #52)
            collectRules(projection.path("calculationRules"), rules);
        }
        return rules;
    }

    private static void collectRules(JsonNode calcRules, List<CalcRule> rules) {
        if (!calcRules.isArray()) return;
        for (JsonNode r : calcRules) {
            if (rules.size() >= ExpressionEngine.MAX_EXPRESSIONS_PER_TEMPLATE) {
                log.warn("Expression count exceeds limit ({}), truncating",
                        ExpressionEngine.MAX_EXPRESSIONS_PER_TEMPLATE);
                return;
            }
            String id = r.path("id").asText("");
            // V1 projection uses "targetField"; V2 ReportDefinition uses "key" (issue #52)
            String targetField = r.path("targetField").asText(r.path("key").asText(null));
            String expression = r.path("expression").asText(null);
            String policy = r.path("roundingPolicy").asText("none");
            int scale = r.path("roundingScale").asInt(0);
            if (targetField == null || expression == null) continue;
            rules.add(new CalcRule(id, targetField, expression, policy, scale));
        }
    }

    // ── Topological sort (Kahn's algorithm) ──────────────────────────────────

    private static List<CalcRule> topologicalSort(List<CalcRule> rules) {
        // Build a map from targetField → CalcRule
        Map<String, CalcRule> byTarget = new LinkedHashMap<>();
        for (CalcRule r : rules) byTarget.put(r.targetField(), r);

        // Build dependency graph: targetField → set of targetFields it depends on
        Map<String, Set<String>> deps = new LinkedHashMap<>();
        for (CalcRule r : rules) {
            Set<String> ruleDeps = extractDependencies(r.expression(), byTarget.keySet());
            // Self-reference is a cycle
            if (ruleDeps.contains(r.targetField())) {
                throw new CircularDependencyException(Set.of(r.targetField()));
            }
            deps.put(r.targetField(), ruleDeps);
        }

        // Kahn's algorithm
        Map<String, Integer> inDegree = new LinkedHashMap<>();
        Map<String, Set<String>> reverseDeps = new LinkedHashMap<>();
        for (String field : byTarget.keySet()) {
            inDegree.put(field, 0);
            reverseDeps.put(field, new LinkedHashSet<>());
        }
        for (Map.Entry<String, Set<String>> e : deps.entrySet()) {
            String field = e.getKey();
            for (String dep : e.getValue()) {
                if (byTarget.containsKey(dep)) {
                    inDegree.merge(field, 1, Integer::sum);
                    reverseDeps.computeIfAbsent(dep, k -> new LinkedHashSet<>()).add(field);
                }
            }
        }

        Queue<String> queue = new ArrayDeque<>();
        for (Map.Entry<String, Integer> e : inDegree.entrySet()) {
            if (e.getValue() == 0) queue.add(e.getKey());
        }

        List<CalcRule> ordered = new ArrayList<>();
        while (!queue.isEmpty()) {
            String field = queue.poll();
            ordered.add(byTarget.get(field));
            for (String dependant : reverseDeps.getOrDefault(field, Set.of())) {
                int newDeg = inDegree.merge(dependant, -1, Integer::sum);
                if (newDeg == 0) queue.add(dependant);
            }
        }

        if (ordered.size() < rules.size()) {
            // Cycle detected — find fields still in the graph
            Set<String> cycleFields = new LinkedHashSet<>(byTarget.keySet());
            ordered.forEach(r -> cycleFields.remove(r.targetField()));
            throw new CircularDependencyException(cycleFields);
        }

        return ordered;
    }

    /**
     * Extract identifiers from an expression that match known computed fields.
     * Uses the JEXL parser (issue #57) so identifiers inside string literals or
     * quoted arguments no longer create false dependencies / false cycles;
     * falls back to a regex token scan when the expression fails to parse.
     */
    private static Set<String> extractDependencies(String expression, Set<String> knownFields) {
        Set<String> parsed = ExpressionEngine.extractVariables(expression);
        if (parsed != null) {
            Set<String> deps = new LinkedHashSet<>(parsed);
            deps.retainAll(knownFields);
            return deps;
        }
        Set<String> deps = new LinkedHashSet<>();
        Matcher m = IDENT.matcher(expression);
        while (m.find()) {
            String token = m.group();
            if (knownFields.contains(token)) deps.add(token);
        }
        return deps;
    }

    // ── Rounding ──────────────────────────────────────────────────────────────

    /**
     * BigDecimal-based rounding (issue #57): monetary values are rounded in
     * decimal space, never via double math. Policies: {@code floor},
     * {@code ceil}, {@code round}/{@code half_up}, {@code half_even};
     * {@code roundingScale} selects the decimal places (default 0).
     */
    private static Object applyRounding(Object value, String policy, int scale) {
        if (!(value instanceof Number n) || policy == null || "none".equals(policy)) return value;
        java.math.RoundingMode mode = switch (policy) {
            case "floor" -> java.math.RoundingMode.FLOOR;
            case "ceil" -> java.math.RoundingMode.CEILING;
            case "round", "half_up" -> java.math.RoundingMode.HALF_UP;
            case "half_even" -> java.math.RoundingMode.HALF_EVEN;
            default -> null;
        };
        if (mode == null) return value;
        return new java.math.BigDecimal(n.toString()).setScale(scale, mode);
    }

    // ── Form data conversion ──────────────────────────────────────────────────

    /**
     * Convert a Jackson JsonNode (object) to a {@code Map<String, Object>} for JEXL context.
     * Arrays become {@code List<Map<String, Object>>}. Numbers become Double.
     */
    static Map<String, Object> formDataToMap(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return new LinkedHashMap<>();
        try {
            return MAPPER.convertValue(node, MAP_TYPE);
        } catch (Exception e) {
            log.warn("CalculationEngine: failed to convert formData node to Map — returning empty: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }
}
