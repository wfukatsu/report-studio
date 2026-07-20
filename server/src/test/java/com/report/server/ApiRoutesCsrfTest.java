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

    // ── Safe methods are never CSRF-checked ────────────────────────────────────

    @Test
    void safeMethodsAlwaysAllowed() {
        assertNull(ApiRoutes.csrfRejectReason("GET", APP, null, null, null));
        assertNull(ApiRoutes.csrfRejectReason("HEAD", APP, null, null, null));
        assertNull(ApiRoutes.csrfRejectReason("OPTIONS", APP, null, null, null));
    }

    // ── The gap this issue fixes: missing Origin on a state-changing request ────

    @Test
    void post_missingOriginAndReferer_rejected() {
        assertNotNull(ApiRoutes.csrfRejectReason("POST", APP, null, null, null));
    }

    @Test
    void put_blankOrigin_rejected() {
        assertNotNull(ApiRoutes.csrfRejectReason("PUT", APP, "  ", null, null));
    }

    // ── Valid / foreign origins ────────────────────────────────────────────────

    @Test
    void post_allowedOrigin_ok() {
        assertNull(ApiRoutes.csrfRejectReason("POST", APP, OK_ORIGIN, null, null));
        assertNull(ApiRoutes.csrfRejectReason("POST", APP, "http://localhost:8080", null, null));
    }

    @Test
    void post_foreignOrigin_rejected() {
        assertNotNull(ApiRoutes.csrfRejectReason("POST", APP, "https://evil.example", null, null));
    }

    // ── Referer fallback when Origin is absent ─────────────────────────────────

    @Test
    void post_validRefererFallback_ok() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", APP, null, "http://localhost:5173/editor", null));
    }

    @Test
    void post_foreignReferer_rejected() {
        assertNotNull(
                ApiRoutes.csrfRejectReason("POST", APP, null, "https://evil.example/page", null));
    }

    // ── Bearer/PAT clients are exempt (not cookie-authenticated) ───────────────

    @Test
    void post_bearerToken_exemptEvenWithoutOrigin() {
        assertNull(ApiRoutes.csrfRejectReason("POST", APP, null, null, "Bearer rpat_abc"));
    }

    @Test
    void post_bearerToken_exemptEvenWithForeignOrigin() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", APP, "https://evil.example", null, "Bearer rpat_abc"));
    }

    // ── Auth / public paths tolerate a missing header (CLI login, public forms) ─

    @Test
    void post_authPath_missingOrigin_allowed() {
        assertNull(ApiRoutes.csrfRejectReason("POST", "/api/v1/auth/login", null, null, null));
    }

    @Test
    void post_publicPath_missingOrigin_allowed() {
        assertNull(
                ApiRoutes.csrfRejectReason(
                        "POST", "/api/v1/public/forms/t1/submit", null, null, null));
    }

    @Test
    void post_authPath_foreignOrigin_stillRejected() {
        assertNotNull(
                ApiRoutes.csrfRejectReason(
                        "POST", "/api/v1/auth/login", "https://evil.example", null, null));
    }
}
