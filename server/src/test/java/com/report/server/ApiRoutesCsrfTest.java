package com.report.server;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ApiRoutes#csrfRejectReason} — the CSRF Origin/Referer decision (#201).
 * {@code null} means allow; a non-null reason means the before-filter rejects with 403.
 */
class ApiRoutesCsrfTest {

    private static final String APP = "/api/v2/templates/t1";
    private static final String OK_ORIGIN = "http://localhost:5173";
    private static final int PORT = 8080;

    // ── Safe methods are never CSRF-checked ────────────────────────────────────

    @Test
    void safeMethodsAlwaysAllowed() {
        assertNull(ApiRoutes.csrfRejectReason("GET", APP, null, null, null, PORT));
        assertNull(ApiRoutes.csrfRejectReason("HEAD", APP, null, null, null, PORT));
        assertNull(ApiRoutes.csrfRejectReason("OPTIONS", APP, null, null, null, PORT));
    }

    // ── The gap this issue fixes: missing Origin on a state-changing request ────

    @Test
    void post_missingOriginAndReferer_rejected() {
        assertNotNull(ApiRoutes.csrfRejectReason("POST", APP, null, null, null, PORT));
    }

    @Test
    void put_blankOrigin_rejected() {
        assertNotNull(ApiRoutes.csrfRejectReason("PUT", APP, "  ", null, null, PORT));
    }

    // ── Valid / foreign origins ────────────────────────────────────────────────

    @Test
    void post_allowedOrigin_ok() {
        assertNull(ApiRoutes.csrfRejectReason("POST", APP, OK_ORIGIN, null, null, PORT));
        assertNull(
                ApiRoutes.csrfRejectReason("POST", APP, "http://localhost:8080", null, null, PORT));
    }

    @Test
    void post_foreignOrigin_rejected() {
        assertNotNull(
                ApiRoutes.csrfRejectReason("POST", APP, "https://evil.example", null, null, PORT));
    }

    // ── Same-origin check follows the actual listen port, not hardcoded 8080 (#259) ─

    @Test
    void post_nonDefaultPort_sameOriginAllowed() {
        assertNull(
                ApiRoutes.csrfRejectReason("POST", APP, "http://localhost:9090", null, null, 9090));
    }

    @Test
    void post_nonDefaultPort_port8080OriginRejected() {
        assertNotNull(
                ApiRoutes.csrfRejectReason("POST", APP, "http://localhost:8080", null, null, 9090));
    }

    @Test
    void post_nonDefaultPort_refererFallbackAllowed() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", APP, null, "http://localhost:9090/editor", null, 9090));
    }

    // ── Referer fallback when Origin is absent ─────────────────────────────────

    @Test
    void post_validRefererFallback_ok() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", APP, null, "http://localhost:5173/editor", null, PORT));
    }

    @Test
    void post_foreignReferer_rejected() {
        assertNotNull(
                ApiRoutes.csrfRejectReason(
                        "POST", APP, null, "https://evil.example/page", null, PORT));
    }

    // ── Bearer/PAT clients are exempt (not cookie-authenticated) ───────────────

    @Test
    void post_bearerToken_exemptEvenWithoutOrigin() {
        assertNull(ApiRoutes.csrfRejectReason("POST", APP, null, null, "Bearer rpat_abc", PORT));
    }

    @Test
    void post_bearerToken_exemptEvenWithForeignOrigin() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", APP, "https://evil.example", null, "Bearer rpat_abc", PORT));
    }

    // ── Auth / public paths tolerate a missing header (CLI login, public forms) ─

    @Test
    void post_authPath_missingOrigin_allowed() {
        assertNull(
                ApiRoutes.csrfRejectReason("POST", "/api/v1/auth/login", null, null, null, PORT));
    }

    @Test
    void post_publicPath_missingOrigin_allowed() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", "/api/v1/public/forms/t1/submit", null, null, null, PORT));
    }

    @Test
    void post_authPath_foreignOrigin_stillRejected() {
        assertNotNull(
                ApiRoutes.csrfRejectReason(
                        "POST", "/api/v1/auth/login", "https://evil.example", null, null, PORT));
    }
}
