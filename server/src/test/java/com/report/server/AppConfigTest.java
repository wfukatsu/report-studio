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

    // ── applyPoolOverrides (#274) ────────────────────────────────────────────

    @Test
    void applyPoolOverrides_absentValuesLeavePropertiesUntouched() {
        var props = new java.util.Properties();
        props.setProperty("scalar.db.jdbc.connection_pool.min_idle", "2");

        AppConfig.applyPoolOverrides(props, null, "", "  ");

        assertEquals("2", props.getProperty("scalar.db.jdbc.connection_pool.min_idle"));
        assertNull(props.getProperty("scalar.db.jdbc.connection_pool.max_idle"));
        assertNull(props.getProperty("scalar.db.jdbc.connection_pool.max_total"));
    }

    @Test
    void applyPoolOverrides_setsAllThreeWhenProvided() {
        var props = new java.util.Properties();

        AppConfig.applyPoolOverrides(props, "3", "8", "20");

        assertEquals("3", props.getProperty("scalar.db.jdbc.connection_pool.min_idle"));
        assertEquals("8", props.getProperty("scalar.db.jdbc.connection_pool.max_idle"));
        assertEquals("20", props.getProperty("scalar.db.jdbc.connection_pool.max_total"));
    }

    @Test
    void applyPoolOverrides_ignoresNonNumericAndNegativeValues() {
        var props = new java.util.Properties();
        props.setProperty("scalar.db.jdbc.connection_pool.max_total", "10");

        AppConfig.applyPoolOverrides(props, "lots", "-1", "abc");

        assertNull(props.getProperty("scalar.db.jdbc.connection_pool.min_idle"));
        assertNull(props.getProperty("scalar.db.jdbc.connection_pool.max_idle"));
        assertEquals("10", props.getProperty("scalar.db.jdbc.connection_pool.max_total"));
    }

    @Test
    void loadFileProperties_appliesEnvOverridesOnTopOfFile() throws Exception {
        var file = java.nio.file.Files.createTempFile("scalardb", ".properties");
        try {
            java.nio.file.Files.writeString(
                    file,
                    """
                    scalar.db.storage=jdbc
                    scalar.db.contact_points=jdbc:sqlite:data/test.db
                    scalar.db.jdbc.connection_pool.max_total=10
                    """);

            var props = AppConfig.loadFileProperties(file, "2", null, "40");

            assertEquals("jdbc", props.getProperty("scalar.db.storage"));
            assertEquals("jdbc:sqlite:data/test.db", props.getProperty("scalar.db.contact_points"));
            // env override wins over the file value
            assertEquals("40", props.getProperty("scalar.db.jdbc.connection_pool.max_total"));
            // env-only value is added
            assertEquals("2", props.getProperty("scalar.db.jdbc.connection_pool.min_idle"));
            // absent env leaves the file's (absent) value untouched
            assertNull(props.getProperty("scalar.db.jdbc.connection_pool.max_idle"));
        } finally {
            java.nio.file.Files.deleteIfExists(file);
        }
    }

    // ── parseMaxRequestSize (#274) ───────────────────────────────────────────

    @Test
    void parseMaxRequestSize_defaultsTo5MB() {
        assertEquals(5_000_000L, AppConfig.parseMaxRequestSize(null));
        assertEquals(5_000_000L, AppConfig.parseMaxRequestSize(""));
    }

    @Test
    void parseMaxRequestSize_parsesExplicitValue() {
        assertEquals(10_000_000L, AppConfig.parseMaxRequestSize("10000000"));
        assertEquals(1L, AppConfig.parseMaxRequestSize(" 1 "));
    }

    @Test
    void parseMaxRequestSize_rejectsNonPositiveAndGarbage() {
        assertEquals(5_000_000L, AppConfig.parseMaxRequestSize("0"));
        assertEquals(5_000_000L, AppConfig.parseMaxRequestSize("-5"));
        assertEquals(5_000_000L, AppConfig.parseMaxRequestSize("5MB"));
    }

    // ── parseDevPortRange (#274) ─────────────────────────────────────────────

    @Test
    void parseDevPortRange_defaultsToViteRange() {
        assertArrayEquals(new int[] {5173, 5200}, AppConfig.parseDevPortRange(null));
        assertArrayEquals(new int[] {5173, 5200}, AppConfig.parseDevPortRange(" "));
    }

    @Test
    void parseDevPortRange_parsesExplicitRange() {
        assertArrayEquals(new int[] {3000, 3010}, AppConfig.parseDevPortRange("3000-3010"));
        assertArrayEquals(new int[] {5173, 5173}, AppConfig.parseDevPortRange("5173-5173"));
    }

    @Test
    void parseDevPortRange_rejectsMalformedInput() {
        assertArrayEquals(new int[] {5173, 5200}, AppConfig.parseDevPortRange("5173"));
        assertArrayEquals(new int[] {5173, 5200}, AppConfig.parseDevPortRange("a-b"));
        assertArrayEquals(new int[] {5173, 5200}, AppConfig.parseDevPortRange("5200-5173"));
        assertArrayEquals(new int[] {5173, 5200}, AppConfig.parseDevPortRange("0-70000"));
    }
}
