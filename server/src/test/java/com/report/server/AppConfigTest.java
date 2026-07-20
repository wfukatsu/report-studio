package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * Pure-function tests for {@link AppConfig}: port resolution precedence (args over PORT env over
 * 8080 default, non-numeric values ignored) and the Secure-cookie flag (COOKIE_SECURE=true or an
 * https:// ALLOWED_ORIGIN). Tests target the package-private overloads that take explicit values;
 * the public methods delegate to them with System.getenv.
 */
class AppConfigTest {

    // ── resolvePort ──────────────────────────────────────────────────────────

    @Test
    void resolvePort_prefersArgsOverEnv() {
        assertEquals(9090, AppConfig.resolvePort(new String[] {"9090"}, "7070"));
    }

    @Test
    void resolvePort_usesEnvWhenNoArgs() {
        assertEquals(7070, AppConfig.resolvePort(new String[] {}, "7070"));
    }

    @Test
    void resolvePort_defaultsTo8080WhenNoArgsAndNoEnv() {
        assertEquals(8080, AppConfig.resolvePort(new String[] {}, null));
    }

    @Test
    void resolvePort_ignoresNonNumericArgAndFallsBackToEnv() {
        assertEquals(7070, AppConfig.resolvePort(new String[] {"not-a-port"}, "7070"));
    }

    @Test
    void resolvePort_ignoresNonNumericArgAndEnv() {
        assertEquals(8080, AppConfig.resolvePort(new String[] {"abc"}, "xyz"));
    }

    @Test
    void resolvePort_ignoresNonNumericEnvAlone() {
        assertEquals(8080, AppConfig.resolvePort(new String[] {}, ""));
    }

    @Test
    void resolvePort_publicOverloadStillResolves() {
        // Delegates to the same logic; args take precedence regardless of the real env.
        assertEquals(9191, AppConfig.resolvePort(new String[] {"9191"}));
    }

    // ── secureCookies ────────────────────────────────────────────────────────

    @Test
    void secureCookies_explicitTrueEnablesFlag() {
        assertTrue(AppConfig.secureCookies("true", null));
    }

    @Test
    void secureCookies_explicitTrueIsCaseInsensitive() {
        assertTrue(AppConfig.secureCookies("TRUE", null));
    }

    @Test
    void secureCookies_httpsOriginEnablesFlag() {
        assertTrue(AppConfig.secureCookies(null, "https://reports.example.com"));
    }

    @Test
    void secureCookies_httpOriginDoesNotEnableFlag() {
        assertFalse(AppConfig.secureCookies(null, "http://reports.example.com"));
    }

    @Test
    void secureCookies_defaultsToFalse() {
        assertFalse(AppConfig.secureCookies(null, null));
    }

    @Test
    void secureCookies_explicitFalseWithHttpsOriginStillSecure() {
        // https:// origin wins even when COOKIE_SECURE is explicitly "false"
        assertTrue(AppConfig.secureCookies("false", "https://reports.example.com"));
    }

    @Test
    void secureCookies_garbageExplicitValueIgnored() {
        assertFalse(AppConfig.secureCookies("yes", "localhost"));
    }
}
