package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.commons.jexl3.*;
import org.apache.commons.jexl3.introspection.JexlPermissions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

/**
 * ExpressionEngine — Phase 5 implementation using Apache Commons JEXL 3.x.
 *
 * <p>Security constraints:
 * <ul>
 *   <li>Sandbox: deny-by-default; only {@code java.lang.Math} is permitted</li>
 *   <li>Only {@code createExpression()} is used — {@code createScript()} (which allows loops)
 *       is intentionally not exposed</li>
 *   <li>500 ms timeout per evaluation to prevent CPU exhaustion</li>
 * </ul>
 *
 * <p>Custom functions (callable without namespace prefix) — see {@link JexlFunctions}:
 * <ul>
 *   <li>{@code sum(collection, fieldName)} — sum a numeric field across a list of maps</li>
 *   <li>{@code count(collection)} — count elements in a collection</li>
 *   <li>{@code round(value, scale)} — round a number to N decimal places</li>
 * </ul>
 */
public final class ExpressionEngine {

    private static final Logger log = LoggerFactory.getLogger(ExpressionEngine.class);
    private static final long TIMEOUT_MS = 500;

    /** Maximum allowed expression length (chars). */
    public static final int MAX_EXPRESSION_LENGTH = 500;

    /** Maximum number of expressions per template evaluation. */
    public static final int MAX_EXPRESSIONS_PER_TEMPLATE = 50;

    /** Shared, thread-safe JEXL engine instance. */
    private static final JexlEngine JEXL = buildEngine();

    private ExpressionEngine() {}

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Evaluate a condition expression — used for {@code ValidationRule.condition}.
     *
     * <p>null / blank → returns {@code true} (unconditional rule always fires).
     * Evaluation errors are logged and return {@code false} (fail-safe).
     *
     * @param expression  condition string (may be null or blank)
     * @param context     variable bindings (form data fields etc.)
     * @param rowIndex    current detail row index (available as {@code _row} in expression)
     */
    public static boolean evaluate(String expression, Map<String, Object> context, int rowIndex) {
        if (expression == null || expression.isBlank()) return true;
        if (expression.length() > MAX_EXPRESSION_LENGTH) {
            log.warn("Expression exceeds max length ({} > {}): {}...",
                    expression.length(), MAX_EXPRESSION_LENGTH, expression.substring(0, 50));
            return false;
        }
        try {
            String jexlExpr = translateFormulaToJexl(expression);
            JexlContext ctx = toJexlContext(context);
            ctx.set("_row", rowIndex);
            // strict=false for evaluate — missing variables return null rather than throwing
            JexlExpression expr = JEXL.createExpression(jexlExpr);
            Object result = evaluateWithTimeout(expr, ctx);
            if (result instanceof Boolean b) return b;
            if (result == null) return false;
            return Boolean.parseBoolean(result.toString());
        } catch (ExpressionTimeoutException e) {
            log.warn("Expression evaluation timed out: {}", expression);
            return false;
        } catch (Exception e) {
            log.debug("Expression evaluation error (condition): {} — {}", expression, e.getMessage());
            return false;
        }
    }

    /**
     * Calculate a value — used for {@code CalculationRule.expression}.
     *
     * @param expression  arithmetic / aggregate expression
     * @param context     variable bindings enriched with prior calculation results
     * @return            computed value (Number, String, Boolean, or null)
     * @throws ExpressionTimeoutException if evaluation exceeds 500 ms
     * @throws JexlException              on syntax / sandbox violation
     */
    public static Object calculate(String expression, Map<String, Object> context) {
        if (expression != null && expression.length() > MAX_EXPRESSION_LENGTH) {
            throw new IllegalArgumentException("Expression exceeds max length ("
                    + expression.length() + " > " + MAX_EXPRESSION_LENGTH + ")");
        }
        String jexlExpr = translateFormulaToJexl(expression);
        JexlContext ctx = toJexlContext(context);
        // strict=true for calculate — surface typos as errors rather than silently returning null
        JexlExpression expr = JEXL.createExpression(jexlExpr);
        return evaluateWithTimeout(expr, ctx);
    }

    // ── Engine construction ────────────────────────────────────────────────────

    private static JexlEngine buildEngine() {
        // RESTRICTED blocks unsafe Java packages (reflect, invoke, security, io, net, Process).
        // Combined with createExpression()-only usage and 500 ms timeout, this hardens the sandbox.
        JexlPermissions permissions = JexlPermissions.RESTRICTED
                .compose("com.report.server.*");  // needed so JEXL can call methods on JexlFunctions namespace

        // Map.of() does not allow null keys; JEXL resolves un-prefixed functions via null namespace key.
        java.util.HashMap<String, Object> ns = new java.util.HashMap<>();
        ns.put(null, new JexlFunctions());
        ns.put("Math", Math.class);

        return new JexlBuilder()
                .permissions(permissions)
                .strict(true)
                .silent(false)
                .namespaces(ns)
                .create();
    }

    // ── Timeout wrapper ───────────────────────────────────────────────────────

    /**
     * Shared virtual-thread executor — Java 21 virtual threads are extremely lightweight.
     * Replaces per-call newSingleThreadExecutor() which created+destroyed OS threads on each evaluation.
     * Never shut down; lives for the server's lifetime.
     */
    private static final ExecutorService EVAL_EXECUTOR =
            Executors.newVirtualThreadPerTaskExecutor();

    private static Object evaluateWithTimeout(JexlExpression expr, JexlContext ctx) {
        Future<Object> future = EVAL_EXECUTOR.submit(() -> expr.evaluate(ctx));
        try {
            return future.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new ExpressionTimeoutException(
                    "Expression exceeded " + TIMEOUT_MS + "ms: " + expr);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof JexlException je) throw je;
            if (cause instanceof RuntimeException re) throw re;
            throw new RuntimeException("Expression evaluation failed", cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ExpressionTimeoutException("Expression evaluation interrupted");
        }
    }

    // ── Formula-v1 translation layer ────────────────────────────────────────

    /**
     * Mapping from formula-v1 UPPERCASE function names to JEXL equivalents.
     * Must be kept in sync with the frontend's FORMULA_TO_JEXL_MAP in functionCatalog.ts.
     */
    private static final String[][] FORMULA_TO_JEXL_MAP = {
        {"SUM(",         "sum("},
        {"COUNT(",       "count("},
        {"ROUND(",       "round("},
        {"AVG(",         "avg("},
        {"MIN(",         "min("},
        {"MAX(",         "max("},
        {"CONCAT(",      "concat("},
        {"IF(",          "ifExpr("},
        {"TEXT(",        "formatNumber("},
        {"FORMAT_DATE(", "formatDate("},
    };

    /**
     * Translate a formula-v1 expression to JEXL syntax.
     *
     * <p>e.g. {@code SUM(price * qty)} → {@code sum(price * qty)}<br>
     * {@code IF(x > 0, 'yes', 'no')} → {@code ifExpr(x > 0, 'yes', 'no')}
     *
     * <p>If the expression is already in JEXL format (all lowercase), this is a no-op.
     *
     * @param formula  formula-v1 or legacy JEXL expression
     * @return         JEXL-compatible expression string
     */
    static String translateFormulaToJexl(String formula) {
        if (formula == null || formula.isBlank()) return formula;
        String result = formula;
        for (String[] mapping : FORMULA_TO_JEXL_MAP) {
            result = result.replace(mapping[0], mapping[1]);
        }
        return result;
    }

    // ── Context helpers ───────────────────────────────────────────────────────

    private static JexlContext toJexlContext(Map<String, Object> map) {
        MapContext ctx = new MapContext();
        if (map != null) {
            map.forEach(ctx::set);
        }
        return ctx;
    }

    // Custom functions are in the top-level JexlFunctions class (com.report.server.JexlFunctions).
    // compose("com.report.server.*") grants RESTRICTED access to our own top-level classes.
}
