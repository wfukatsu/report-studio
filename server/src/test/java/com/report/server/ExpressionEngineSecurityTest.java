package com.report.server;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Sandbox-boundary tests for the JEXL engine (issue #58).
 *
 * <p>Permissions are RESTRICTED + JexlFunctions only. The previous
 * {@code compose("com.report.server.*")} exposed every public member of the
 * application package to user expressions; these tests pin the tightened
 * boundary.
 */
class ExpressionEngineSecurityTest {

    private static final Map<String, Object> EMPTY = new HashMap<>();

    @Test
    void applicationClasses_areNotInstantiable() {
        // Reachable before the fix: public record constructor in com.report.server.pdf
        assertThrows(Exception.class, () -> ExpressionEngine.calculate(
                "new('com.report.server.pdf.VariantContext', {:}, {:})", EMPTY),
                "application classes must not be reachable from user expressions");
    }

    @Test
    void applicationStaticMethods_areNotCallable() {
        assertThrows(Exception.class, () -> ExpressionEngine.calculate(
                "new('com.report.server.TenantInfoProvider')", EMPTY));
    }

    @Test
    void dangerousJdkClasses_remainBlocked() {
        assertThrows(Exception.class, () -> ExpressionEngine.calculate(
                "new('java.lang.ProcessBuilder', ['ls'])", EMPTY));
        // Denied methods on Class resolve to null (blocked without throwing)
        assertNull(ExpressionEngine.calculate(
                "''.class.forName('java.lang.Runtime')", EMPTY));
    }

    @Test
    void jexlFunctionsNamespace_stillWorks() {
        Object result = ExpressionEngine.calculate("round(1.6, 0)", EMPTY);
        assertEquals(2.0, ((Number) result).doubleValue(), 0.001);
    }

    @Test
    void mathNamespace_stillWorks() {
        Object result = ExpressionEngine.calculate("Math:abs(-5)", EMPTY);
        assertEquals(5, ((Number) result).intValue());
    }

    @Test
    void plainArithmetic_stillWorks() {
        Map<String, Object> ctx = new HashMap<>();
        ctx.put("price", 100.0);
        ctx.put("qty", 3.0);
        Object result = ExpressionEngine.calculate("price * qty", ctx);
        assertEquals(300.0, ((Number) result).doubleValue(), 0.001);
    }
}
