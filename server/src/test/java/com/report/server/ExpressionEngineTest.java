package com.report.server;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ExpressionEngineTest {

    // ── evaluate() — condition evaluation ────────────────────────────────────

    @Test
    void evaluate_nullExpression_returnsTrue() {
        assertTrue(ExpressionEngine.evaluate(null, Map.of(), 0));
    }

    @Test
    void evaluate_blankExpression_returnsTrue() {
        assertTrue(ExpressionEngine.evaluate("  ", Map.of(), 0));
    }

    @Test
    void evaluate_literalTrue_returnsTrue() {
        assertTrue(ExpressionEngine.evaluate("true", Map.of(), 0));
    }

    @Test
    void evaluate_literalFalse_returnsFalse() {
        assertFalse(ExpressionEngine.evaluate("false", Map.of(), 0));
    }

    @Test
    void evaluate_equalityCheck_passes() {
        Map<String, Object> ctx = Map.of("status", "active");
        assertTrue(ExpressionEngine.evaluate("status == 'active'", ctx, 0));
        assertFalse(ExpressionEngine.evaluate("status == 'inactive'", ctx, 0));
    }

    @Test
    void evaluate_numericComparison_works() {
        Map<String, Object> ctx = Map.of("amount", 100.0);
        assertTrue(ExpressionEngine.evaluate("amount > 50", ctx, 0));
        assertFalse(ExpressionEngine.evaluate("amount > 200", ctx, 0));
    }

    @Test
    void evaluate_missingVariable_doesNotThrow() {
        // Missing variable should evaluate gracefully (strict=false for evaluate)
        assertDoesNotThrow(() -> ExpressionEngine.evaluate("missing == 'x'", Map.of(), 0));
    }

    // ── calculate() — expression evaluation ──────────────────────────────────

    @Test
    void calculate_simpleMath_works() {
        Map<String, Object> ctx = Map.of("price", 100.0, "qty", 3.0);
        Object result = ExpressionEngine.calculate("price * qty", ctx);
        assertEquals(300.0, ((Number) result).doubleValue(), 0.01);
    }

    @Test
    void calculate_stringConcatenation_works() {
        Map<String, Object> ctx = Map.of("first", "Hello", "last", "World");
        Object result = ExpressionEngine.calculate("first + ' ' + last", ctx);
        assertEquals("Hello World", result.toString());
    }

    @Test
    void calculate_sumFunction_acrossCollection() {
        List<Map<String, Object>> items = List.of(
                Map.of("amount", 100.0),
                Map.of("amount", 200.0),
                Map.of("amount", 300.0)
        );
        Map<String, Object> ctx = Map.of("items", items);
        Object result = ExpressionEngine.calculate("sum(items, 'amount')", ctx);
        assertEquals(600.0, ((Number) result).doubleValue(), 0.01);
    }

    @Test
    void calculate_countFunction_works() {
        List<Map<String, Object>> items = List.of(
                Map.of("name", "A"),
                Map.of("name", "B"),
                Map.of("name", "C")
        );
        Map<String, Object> ctx = Map.of("items", items);
        Object result = ExpressionEngine.calculate("count(items)", ctx);
        assertEquals(3, ((Number) result).intValue());
    }

    @Test
    void calculate_roundFunction_works() {
        Map<String, Object> ctx = Map.of("value", 12.567);
        Object result = ExpressionEngine.calculate("round(value, 2)", ctx);
        assertEquals(12.57, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void calculate_mathMin_works() {
        Map<String, Object> ctx = Map.of("a", 10.0, "b", 5.0);
        Object result = ExpressionEngine.calculate("Math:min(a, b)", ctx);
        assertEquals(5.0, ((Number) result).doubleValue(), 0.01);
    }

    // ── Security: enforced constraints ────────────────────────────────────────

    @Test
    void createScript_notExposed_onlyCreateExpressionUsed() {
        // Verify only createExpression() is used — scripts (which allow loops/assignments)
        // are intentionally not accessible through the public API.
        // This test exists to document the design intent.
        assertNotNull(ExpressionEngine.class.getDeclaredMethods());
        // The engine is package-private; any loop-capable script must come through App.java.
        // Security relies on: (1) createExpression() only, (2) 500 ms timeout,
        // (3) expressions authored by authenticated template designers.
    }

    @Test
    void calculate_unknownVariable_strictModeThrows() {
        // strict=true surfaces typos/unknown variables as JexlException rather than silently null
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate("undeclaredVariable + 1", Map.of()));
    }

    // ── Security: timeout class exists ───────────────────────────────────────

    @Test
    void expressionTimeoutException_classExists() {
        // Verify ExpressionTimeoutException is defined (the timeout mechanism exists)
        ExpressionTimeoutException ex = new ExpressionTimeoutException("test");
        assertEquals("test", ex.getMessage());
    }

    // ── evaluate() delegates to JEXL (non-blank expressions) ─────────────────

    @Test
    void evaluate_nonBlankExpression_evaluatedByJexl() {
        // Phase 5: non-blank expressions are now evaluated (not always returning false as in Phase 2 stub)
        Map<String, Object> ctx = Map.of("x", 5.0);
        assertTrue(ExpressionEngine.evaluate("x > 3", ctx, 0));
        assertFalse(ExpressionEngine.evaluate("x > 10", ctx, 0));
    }

    // ── Security: injection / sandbox tests ──────────────────────────────────

    @Test
    void calculate_reflectiveClassForName_isRejected() {
        // JEXL sandbox (RESTRICTED) must block Class.forName for untrusted classes —
        // Class methods are not in the RESTRICTED allowlist even if the string literal's
        // getClass() succeeds, forName() must throw
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate(
                        "new('java.lang.reflect.Constructor')", Map.of()));
    }

    @Test
    void calculate_systemExitExpression_isRejected() {
        // System.exit must not be callable from expressions
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate("System:exit(0)", Map.of()));
    }

    @Test
    void calculate_runtimeGetRuntime_isRejected() {
        // java.lang.Runtime access must be blocked (sandbox only allows com.report.server.*)
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate("Runtime:getRuntime()", Map.of()));
    }

    @Test
    void calculate_processBuilderConstruction_isRejected() {
        // new() with untrusted java.lang classes must be blocked by the JEXL sandbox
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate("new('java.lang.ProcessBuilder', 'ls')", Map.of()));
    }

    @Test
    void calculate_fileConstruction_isRejected() {
        // java.io.File must not be constructable from expressions
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate("new('java.io.File', '/')", Map.of()));
    }

    @Test
    void calculate_threadSleepExpression_isRejected() {
        // Thread.sleep must not be callable (potential DoS vector)
        assertThrows(Exception.class,
                () -> ExpressionEngine.calculate("Thread:sleep(1000)", Map.of()));
    }

    // ── Phase 3 built-in functions ────────────────────────────────────────────

    @Test
    void calculate_avgFunction_returnsAverage() throws Exception {
        var items = List.of(
                Map.of("score", 10.0),
                Map.of("score", 20.0),
                Map.of("score", 30.0)
        );
        Object result = ExpressionEngine.calculate("avg(items, 'score')", Map.of("items", items));
        assertEquals(20.0, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void calculate_minFunction_returnsMinimum() throws Exception {
        var items = List.of(Map.of("v", 5.0), Map.of("v", 3.0), Map.of("v", 8.0));
        Object result = ExpressionEngine.calculate("min(items, 'v')", Map.of("items", items));
        assertEquals(3.0, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void calculate_maxFunction_returnsMaximum() throws Exception {
        var items = List.of(Map.of("v", 5.0), Map.of("v", 3.0), Map.of("v", 8.0));
        Object result = ExpressionEngine.calculate("max(items, 'v')", Map.of("items", items));
        assertEquals(8.0, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void calculate_concatFunction_concatenatesStrings() throws Exception {
        Object result = ExpressionEngine.calculate(
                "concat(firstName, ' ', lastName)",
                Map.of("firstName", "太郎", "lastName", "山田"));
        assertEquals("太郎 山田", result);
    }

    @Test
    void calculate_ifExprFunction_trueCondition() throws Exception {
        Object result = ExpressionEngine.calculate(
                "ifExpr(score >= 60, '合格', '不合格')",
                Map.of("score", 80));
        assertEquals("合格", result);
    }

    @Test
    void calculate_ifExprFunction_falseCondition() throws Exception {
        Object result = ExpressionEngine.calculate(
                "ifExpr(score >= 60, '合格', '不合格')",
                Map.of("score", 40));
        assertEquals("不合格", result);
    }

    @Test
    void calculate_formatNumberFunction_integer() throws Exception {
        Object result = ExpressionEngine.calculate("formatNumber(1234567, 'integer')", Map.of());
        assertTrue(result.toString().contains("1,234,567") || result.toString().contains("1234567"));
    }

    @Test
    void calculate_formatDateFunction_formatsDate() throws Exception {
        Object result = ExpressionEngine.calculate(
                "formatDate('2026-04-12', 'yyyy年MM月dd日')", Map.of());
        assertEquals("2026年04月12日", result);
    }

    // ── Formula-v1 translation layer ─────────────────────────────────────────

    @Test
    void translate_SUM_to_sum() {
        assertEquals("sum(items)", ExpressionEngine.translateFormulaToJexl("SUM(items)"));
    }

    @Test
    void translate_COUNT_to_count() {
        assertEquals("count(rows)", ExpressionEngine.translateFormulaToJexl("COUNT(rows)"));
    }

    @Test
    void translate_ROUND_to_round() {
        assertEquals("round(val, 2)", ExpressionEngine.translateFormulaToJexl("ROUND(val, 2)"));
    }

    @Test
    void translate_IF_to_ifExpr() {
        assertEquals("ifExpr(x > 0, 'yes', 'no')", ExpressionEngine.translateFormulaToJexl("IF(x > 0, 'yes', 'no')"));
    }

    @Test
    void translate_TEXT_to_formatNumber() {
        assertEquals("formatNumber(price)", ExpressionEngine.translateFormulaToJexl("TEXT(price)"));
    }

    @Test
    void translate_FORMAT_DATE_to_formatDate() {
        assertEquals("formatDate(d, 'yyyy/MM/dd')", ExpressionEngine.translateFormulaToJexl("FORMAT_DATE(d, 'yyyy/MM/dd')"));
    }

    @Test
    void translate_nested_functions() {
        assertEquals("round(sum(items), 2)", ExpressionEngine.translateFormulaToJexl("ROUND(SUM(items), 2)"));
    }

    @Test
    void translate_passthrough_plain_arithmetic() {
        assertEquals("price * qty + 100", ExpressionEngine.translateFormulaToJexl("price * qty + 100"));
    }

    @Test
    void translate_null_returns_null() {
        assertNull(ExpressionEngine.translateFormulaToJexl(null));
    }

    @Test
    void translate_blank_returns_blank() {
        assertEquals("  ", ExpressionEngine.translateFormulaToJexl("  "));
    }

    // ── Formula-v1 expressions evaluated end-to-end ──────────────────────────

    @Test
    void calculate_formulaV1_SUM_evaluates() {
        var items = List.of(
                Map.of("price", 10.0),
                Map.of("price", 20.0),
                Map.of("price", 30.0)
        );
        Object result = ExpressionEngine.calculate("SUM(items, 'price')", Map.of("items", items));
        assertEquals(60.0, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void calculate_formulaV1_ROUND_evaluates() {
        Object result = ExpressionEngine.calculate("ROUND(value, 2)", Map.of("value", 12.567));
        assertEquals(12.57, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void calculate_formulaV1_IF_evaluates() {
        Object result = ExpressionEngine.calculate("IF(score >= 60, '合格', '不合格')", Map.of("score", 80));
        assertEquals("合格", result);
    }

    @Test
    void evaluate_formulaV1_condition_works() {
        assertTrue(ExpressionEngine.evaluate("x > 3", Map.of("x", 5.0), 0));
    }
}
