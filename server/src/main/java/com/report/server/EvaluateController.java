package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.apache.commons.jexl3.JexlException;

import java.util.Map;

/**
 * Handles V2 expression evaluation endpoints:
 * <ul>
 *   <li>POST /api/v2/templates/{id}/evaluate  — calculation rule evaluation</li>
 *   <li>POST /api/v2/templates/{id}/validate  — validation rule evaluation</li>
 * </ul>
 *
 * <p>evaluate: V2 {@code calculationRules} are adapted to V1 {@link CalculationEngine}
 * projection format via {@link #wrapForCalculation}.
 *
 * <p>validate: V2 {@code validationRules} are evaluated directly via
 * {@link ExpressionEngine#evaluate} — V1 {@code ValidationEngine} handles form field
 * constraints (required/minLength), not JEXL expressions, so it is not used here.
 *
 * <p>Rate limiting: 10 requests per 10 seconds per client IP (JEXL evaluation is CPU-intensive).
 */
public final class EvaluateController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // Security limits — match frontend schema maxima
    private static final int MAX_TEST_DATA_FIELDS = 1000;
    private static final int MAX_RULES = 100;
    // Must match ExpressionEngine.MAX_EXPRESSION_LENGTH to avoid 500 errors for valid expressions
    private static final int MAX_EXPRESSION_LENGTH = ExpressionEngine.MAX_EXPRESSION_LENGTH;

    /** 10 req / 10 s per IP — JEXL evaluation is CPU-intensive. */
    private final RateLimiter rateLimiter;

    EvaluateController() {
        this(new RateLimiter(10, 10_000L));
    }

    /** Package-private constructor for testing with a custom rate limiter. */
    EvaluateController(RateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    // ── evaluate ──────────────────────────────────────────────────────────────

    /**
     * POST /api/v2/templates/{id}/evaluate
     * Body: {@code {definition, testData}}
     * Returns: {@code {results: {key: value}, errors: {key: message}}}
     */
    public void evaluate(Context ctx) throws Exception {
        if (!rateLimiter.isAllowed(ctx.ip())) {
            ctx.status(429);
            ctx.json(Map.of("error", "Too many requests"));
            return;
        }

        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        JsonNode req = parseBody(ctx);
        if (req == null) return;

        JsonNode definition = req.path("definition");
        if (definition.isMissingNode()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Missing 'definition' field"));
            return;
        }

        JsonNode testData = req.path("testData");
        if (testData.isObject() && testData.size() > MAX_TEST_DATA_FIELDS) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "testData too large (max " + MAX_TEST_DATA_FIELDS + " fields)"));
            return;
        }

        JsonNode calcRules = definition.path("calculationRules");
        if (!calcRules.isArray() || calcRules.isEmpty()) {
            ctx.contentType("application/json");
            ctx.result("{\"results\":{},\"errors\":{}}");
            return;
        }

        if (calcRules.size() > MAX_RULES) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Too many calculationRules (max " + MAX_RULES + ")"));
            return;
        }

        // Validate expression lengths before evaluating
        for (JsonNode rule : calcRules) {
            String expr = rule.path("expression").asText("");
            if (expr.length() > MAX_EXPRESSION_LENGTH) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Expression too long in rule '"
                        + sanitize(rule.path("key").asText("")) + "'"));
                return;
            }
        }

        ObjectNode results = MAPPER.createObjectNode();
        ObjectNode errors = MAPPER.createObjectNode();

        JsonNode projection = wrapForCalculation(id, definition);
        try {
            Map<String, Object> computed = CalculationEngine.apply(projection, testData);
            // Return only the computed rule keys (not the original testData fields)
            for (JsonNode rule : calcRules) {
                String key = rule.path("key").asText(null);
                if (key == null || key.isBlank()) continue;
                Object value = computed.get(key);
                putValue(results, key, value);
            }
        } catch (CircularDependencyException e) {
            ctx.status(422);
            ctx.json(Map.of("error", "Circular dependency in calculationRules: " + e.getMessage()));
            return;
        } catch (ExpressionTimeoutException e) {
            ctx.status(422);
            ctx.json(Map.of("error", "Expression evaluation timed out"));
            return;
        } catch (JexlException e) {
            // Per-field error — return partial results with error entry
            for (JsonNode rule : calcRules) {
                String key = rule.path("key").asText(null);
                if (key != null && !key.isBlank()) {
                    errors.put(key, "Expression error: " + sanitize(e.getMessage()));
                }
            }
        }

        ObjectNode response = MAPPER.createObjectNode();
        response.set("results", results);
        response.set("errors", errors);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(response));
    }

    // ── validate ─────────────────────────────────────────────────────────────

    /**
     * POST /api/v2/templates/{id}/validate
     * Body: {@code {definition, testData}}
     * Returns: {@code {violations: [{ruleKey, message, elementId?}]}}
     *
     * <p>A rule fires (produces a violation) when its {@code condition} expression evaluates
     * to {@code true}. Empty / missing condition = no violation.
     */
    public void validate(Context ctx) throws Exception {
        if (!rateLimiter.isAllowed(ctx.ip())) {
            ctx.status(429);
            ctx.json(Map.of("error", "Too many requests"));
            return;
        }

        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        JsonNode req = parseBody(ctx);
        if (req == null) return;

        JsonNode definition = req.path("definition");
        if (definition.isMissingNode()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Missing 'definition' field"));
            return;
        }

        JsonNode testData = req.path("testData");
        if (testData.isObject() && testData.size() > MAX_TEST_DATA_FIELDS) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "testData too large (max " + MAX_TEST_DATA_FIELDS + " fields)"));
            return;
        }

        ArrayNode violations = MAPPER.createArrayNode();
        JsonNode validationRules = definition.path("validationRules");

        if (validationRules.isArray() && !validationRules.isEmpty()) {
            Map<String, Object> context = CalculationEngine.formDataToMap(testData);

            for (JsonNode rule : validationRules) {
                String condition = rule.path("condition").asText(null);
                // Empty condition = no violation (V2 spec; contrast: V1 ExpressionEngine
                // returns true for null/blank — must guard before calling)
                if (condition == null || condition.isBlank()) continue;
                if (condition.length() > MAX_EXPRESSION_LENGTH) continue;

                boolean violated = ExpressionEngine.evaluate(condition, context, 0);
                if (violated) {
                    ObjectNode v = MAPPER.createObjectNode();
                    v.put("ruleKey", rule.path("ruleKey").asText(""));
                    v.put("message", rule.path("message").asText(""));
                    JsonNode elementId = rule.path("elementId");
                    if (!elementId.isMissingNode() && !elementId.isNull()) {
                        v.put("elementId", elementId.asText());
                    }
                    violations.add(v);
                }
            }
        }

        ObjectNode response = MAPPER.createObjectNode();
        response.set("violations", violations);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(response));
    }

    // ── Package-private helper (used by controller and tests) ─────────────────

    /**
     * Wrap V2 {@code calculationRules} into V1 {@link CalculationEngine} projection format.
     * V2 rule {@code key} maps to V1 {@code targetField}.
     */
    static JsonNode wrapForCalculation(String templateId, JsonNode definition) {
        ObjectNode projection = MAPPER.createObjectNode();
        ArrayNode templates = projection.putArray("templates");
        ObjectNode tpl = templates.addObject();
        tpl.put("id", templateId);

        ArrayNode v1Rules = tpl.putArray("calculationRules");
        JsonNode v2Rules = definition.path("calculationRules");
        if (v2Rules.isArray()) {
            for (JsonNode r : v2Rules) {
                String key = r.path("key").asText(null);
                String expression = r.path("expression").asText(null);
                if (key == null || expression == null) continue;

                ObjectNode v1Rule = v1Rules.addObject();
                v1Rule.put("id", key);
                v1Rule.put("targetField", key);
                v1Rule.put("expression", expression);
                // V2 format has no roundingPolicy — default to "none"
                v1Rule.put("roundingPolicy", "none");
            }
        }

        return projection;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static JsonNode parseBody(Context ctx) throws Exception {
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return null;
        }
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return null;
        }
    }

    private static void putValue(ObjectNode node, String key, Object value) {
        if (value == null) {
            node.putNull(key);
        } else if (value instanceof Number n) {
            node.put(key, n.doubleValue());
        } else if (value instanceof Boolean b) {
            node.put(key, b);
        } else {
            node.put(key, value.toString());
        }
    }

    /** Truncate and strip control chars to prevent log injection in error messages. */
    private static String sanitize(String s) {
        if (s == null) return "";
        String safe = s.replaceAll("[\r\n\t]", " ");
        return safe.length() > 200 ? safe.substring(0, 200) : safe;
    }
}
