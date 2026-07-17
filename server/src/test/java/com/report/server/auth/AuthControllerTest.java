package com.report.server.auth;

import at.favre.lib.crypto.bcrypt.BCrypt;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AuthController} — login success/failure, logout,
 * session TTL expiry, per-IP login rate limiting (default 5 attempts / 5 min)
 * and the DUMMY_HASH timing-attack mitigation.
 *
 * <p>Follows the mock pattern of {@link UserRepositoryTest}: the final
 * {@link UserRepository} is mocked via the Mockito inline mock maker and time
 * is injected through the package-private clock-seam constructor.
 */
class AuthControllerTest {

    private static final long SESSION_TTL_MS = 86_400_000L; // 24 hours
    private static final String PASSWORD = "correct-pw";
    /** Low-cost hash keeps the wrong/right password verifications fast. */
    private static final String PASSWORD_HASH =
            BCrypt.withDefaults().hashToString(4, PASSWORD.toCharArray());
    private static final UserRecord ADMIN =
            new UserRecord("admin", "管理者", PASSWORD_HASH, Set.of("admin", "user"));

    private final AtomicLong now = new AtomicLong(1_000_000L);
    private UserRepository userRepo;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        userRepo = mock(UserRepository.class);
        when(userRepo.findById("admin")).thenReturn(Optional.of(ADMIN));
        controller = new AuthController(userRepo, now::get);
    }

    @AfterEach
    void tearDown() {
        controller.shutdown();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Context loginContext(String userId, String password, String ip) {
        Context ctx = mock(Context.class);
        when(ctx.ip()).thenReturn(ip);
        when(ctx.bodyAsClass(Map.class)).thenReturn(mapOfNullable(userId, password));
        return ctx;
    }

    private static Map<String, Object> mapOfNullable(String userId, String password) {
        java.util.HashMap<String, Object> m = new java.util.HashMap<>();
        m.put("userId", userId);
        m.put("password", password);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> capturedJson(Context ctx) {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        return (Map<String, Object>) captor.getValue();
    }

    /** Logs in successfully and returns the issued session cookie. */
    private Cookie loginAndCaptureCookie() {
        Context ctx = loginContext("admin", PASSWORD, "10.0.0.1");
        controller.login(ctx);
        ArgumentCaptor<Cookie> cookieCaptor = ArgumentCaptor.forClass(Cookie.class);
        verify(ctx).cookie(cookieCaptor.capture());
        return cookieCaptor.getValue();
    }

    private Context requestWithSession(String sessionId) {
        Context ctx = mock(Context.class);
        when(ctx.cookie("session_id")).thenReturn(sessionId);
        return ctx;
    }

    // ── Login success ────────────────────────────────────────────────────────

    @Test
    void loginSuccess_returnsUserAndSetsSessionCookie() {
        Context ctx = loginContext("admin", PASSWORD, "10.0.0.1");

        controller.login(ctx);

        verify(ctx, never()).status(any(HttpStatus.class));
        Map<String, Object> body = capturedJson(ctx);
        assertEquals("admin", body.get("userId"));
        assertEquals("管理者", body.get("displayName"));
        assertEquals(Set.of("admin", "user"), body.get("roles"));
        assertEquals(false, body.get("anonymous"));

        ArgumentCaptor<Cookie> cookieCaptor = ArgumentCaptor.forClass(Cookie.class);
        verify(ctx).cookie(cookieCaptor.capture());
        Cookie cookie = cookieCaptor.getValue();
        assertEquals("session_id", cookie.getName());
        assertFalse(cookie.getValue().isBlank());
        assertTrue(cookie.isHttpOnly(), "session cookie must be HttpOnly");
        assertEquals("/api/", cookie.getPath());
        assertEquals(86400, cookie.getMaxAge());
    }

    @Test
    void loginSuccess_sessionResolvesToPrincipal() {
        Cookie cookie = loginAndCaptureCookie();

        Principal principal = controller.resolveFromRequest(requestWithSession(cookie.getValue()));

        assertEquals("admin", principal.userId());
        assertFalse(principal.isAnonymous());
        assertTrue(principal.hasRole("admin"));
    }

    // ── Login failure ────────────────────────────────────────────────────────

    @Test
    void loginWrongPassword_401() {
        Context ctx = loginContext("admin", "wrong-pw", "10.0.0.1");

        controller.login(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        assertEquals("Invalid credentials", capturedJson(ctx).get("error"));
        verify(ctx, never()).cookie(any(Cookie.class));
    }

    @Test
    void loginUnknownUser_401_sameErrorAsWrongPassword() {
        when(userRepo.findById("ghost")).thenReturn(Optional.empty());
        Context ctx = loginContext("ghost", "whatever", "10.0.0.1");

        controller.login(ctx);

        // Indistinguishable from the wrong-password response (user enumeration defence)
        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        assertEquals("Invalid credentials", capturedJson(ctx).get("error"));
    }

    @Test
    void loginUnknownUser_stillRunsBcryptVerification() {
        // DUMMY_HASH is a cost-12 bcrypt hash; verifying against it takes well
        // over 50ms on any hardware. A missing-user fast path would return in
        // microseconds — that timing difference is what leaks user existence.
        when(userRepo.findById("ghost")).thenReturn(Optional.empty());
        Context ctx = loginContext("ghost", "whatever", "10.0.0.1");

        long start = System.nanoTime();
        controller.login(ctx);
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        assertTrue(elapsedMs >= 50,
                "unknown-user login returned in " + elapsedMs
                + "ms — DUMMY_HASH bcrypt verification did not run");
    }

    @Test
    void loginMissingUserId_400() {
        Context ctx = loginContext(null, "pw", "10.0.0.1");

        controller.login(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void loginMissingPassword_400() {
        Context ctx = loginContext("admin", null, "10.0.0.1");

        controller.login(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    // ── Rate limiting (default: 5 attempts per 5 minutes per IP) ─────────────

    @Test
    void loginRateLimit_sixthAttemptFromSameIp_429() {
        for (int i = 0; i < 5; i++) {
            Context ctx = loginContext("admin", "wrong-pw", "10.9.9.9");
            controller.login(ctx);
            verify(ctx).status(HttpStatus.UNAUTHORIZED);
        }

        Context sixth = loginContext("admin", "wrong-pw", "10.9.9.9");
        controller.login(sixth);

        verify(sixth).status(HttpStatus.TOO_MANY_REQUESTS);
        assertTrue(((String) capturedJson(sixth).get("error")).contains("Too many login attempts"));
        // The 6th attempt must be rejected before touching the user store
        verify(userRepo, times(5)).findById("admin");
    }

    @Test
    void loginRateLimit_correctPasswordAlsoRejectedOnceLimited() {
        for (int i = 0; i < 5; i++) {
            controller.login(loginContext("admin", "wrong-pw", "10.9.9.9"));
        }

        Context ctx = loginContext("admin", PASSWORD, "10.9.9.9");
        controller.login(ctx);

        verify(ctx).status(HttpStatus.TOO_MANY_REQUESTS);
        verify(ctx, never()).cookie(any(Cookie.class));
    }

    @Test
    void loginRateLimit_isPerIp() {
        for (int i = 0; i < 5; i++) {
            controller.login(loginContext("admin", "wrong-pw", "10.9.9.9"));
        }

        Context otherIp = loginContext("admin", PASSWORD, "10.1.1.1");
        controller.login(otherIp);

        verify(otherIp, never()).status(any(HttpStatus.class));
        assertEquals("admin", capturedJson(otherIp).get("userId"));
    }

    @Test
    void loginRateLimit_successfulLoginResetsTheCounter() {
        // 4 failed attempts accumulate...
        for (int i = 0; i < 4; i++) {
            controller.login(loginContext("admin", "wrong-pw", "10.9.9.9"));
        }
        // ...a 5th (successful) login is still within budget and forgives the IP.
        Context success = loginContext("admin", PASSWORD, "10.9.9.9");
        controller.login(success);
        verify(success).cookie(any(Cookie.class));

        // Counter reset: a fresh run of failed attempts from the same IP is allowed
        // again (would be 429 on the 6th cumulative attempt without the reset).
        for (int i = 0; i < 5; i++) {
            Context ctx = loginContext("admin", "wrong-pw", "10.9.9.9");
            controller.login(ctx);
            verify(ctx).status(HttpStatus.UNAUTHORIZED);
            verify(ctx, never()).status(HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    @Test
    void loginRateLimit_repeatedSuccessfulLoginsNeverThrottled() {
        // Genuine repeat logins (e.g. many users behind one NAT IP) must not hit 429.
        for (int i = 0; i < 10; i++) {
            Context ctx = loginContext("admin", PASSWORD, "10.9.9.9");
            controller.login(ctx);
            verify(ctx, never()).status(HttpStatus.TOO_MANY_REQUESTS);
            verify(ctx).cookie(any(Cookie.class));
        }
    }

    // ── Session resolution / TTL ─────────────────────────────────────────────

    @Test
    void resolveWithoutCookie_isAnonymous() {
        Principal principal = controller.resolveFromRequest(requestWithSession(null));

        assertTrue(principal.isAnonymous());
        assertEquals(Principal.ANONYMOUS, principal);
    }

    @Test
    void resolveWithUnknownSessionId_isAnonymous() {
        Principal principal = controller.resolveFromRequest(requestWithSession("forged-session-id"));

        assertTrue(principal.isAnonymous());
    }

    @Test
    void sessionStillValidJustBeforeTtl() {
        Cookie cookie = loginAndCaptureCookie();

        now.addAndGet(SESSION_TTL_MS); // exactly at the boundary — strict > keeps it valid
        Principal principal = controller.resolveFromRequest(requestWithSession(cookie.getValue()));

        assertEquals("admin", principal.userId());
    }

    @Test
    void sessionExpiresAfterTtl_becomesAnonymous() {
        Cookie cookie = loginAndCaptureCookie();

        now.addAndGet(SESSION_TTL_MS + 1);
        Principal principal = controller.resolveFromRequest(requestWithSession(cookie.getValue()));

        assertTrue(principal.isAnonymous(), "expired session must resolve to ANONYMOUS");
    }

    @Test
    void expiredSessionIsRemoved_notRevivedByClockRewind() {
        Cookie cookie = loginAndCaptureCookie();

        now.addAndGet(SESSION_TTL_MS + 1);
        controller.resolveFromRequest(requestWithSession(cookie.getValue()));
        now.addAndGet(-(SESSION_TTL_MS + 1));

        assertTrue(controller.resolveFromRequest(requestWithSession(cookie.getValue())).isAnonymous());
    }

    @Test
    void reLogin_invalidatesPreviousSessionOfSameUser() {
        Cookie first = loginAndCaptureCookie();
        Cookie second = loginAndCaptureCookie();
        assertNotEquals(first.getValue(), second.getValue());

        assertTrue(controller.resolveFromRequest(requestWithSession(first.getValue())).isAnonymous(),
                "old session must be invalidated on re-login");
        assertEquals("admin",
                controller.resolveFromRequest(requestWithSession(second.getValue())).userId());
    }

    // ── Logout ───────────────────────────────────────────────────────────────

    @Test
    void logout_invalidatesSessionAndRemovesCookie() {
        Cookie cookie = loginAndCaptureCookie();

        Context logoutCtx = requestWithSession(cookie.getValue());
        controller.logout(logoutCtx);

        verify(logoutCtx).removeCookie("session_id", "/api/");
        assertEquals("logged_out", capturedJson(logoutCtx).get("status"));
        assertTrue(controller.resolveFromRequest(requestWithSession(cookie.getValue())).isAnonymous(),
                "session must be unusable after logout");
    }

    @Test
    void logoutWithoutSession_stillSucceeds() {
        Context ctx = requestWithSession(null);

        controller.logout(ctx);

        verify(ctx).removeCookie("session_id", "/api/");
        assertEquals("logged_out", capturedJson(ctx).get("status"));
    }

    // ── /me ──────────────────────────────────────────────────────────────────

    @Test
    void me_withValidSession_returnsUser() {
        Cookie cookie = loginAndCaptureCookie();

        Context ctx = requestWithSession(cookie.getValue());
        controller.me(ctx);

        Map<String, Object> body = capturedJson(ctx);
        assertEquals("admin", body.get("userId"));
        assertEquals(false, body.get("anonymous"));
    }

    @Test
    void me_withoutSession_returnsAnonymous() {
        Context ctx = requestWithSession(null);

        controller.me(ctx);

        Map<String, Object> body = capturedJson(ctx);
        assertEquals(true, body.get("anonymous"));
        assertEquals("anonymous", body.get("userId"));
    }

    // ── changeProfile ────────────────────────────────────────────────────────

    @Test
    void changeProfile_withoutSession_401() {
        Context ctx = requestWithSession(null);

        controller.changeProfile(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(userRepo, never()).save(any());
    }

    @Test
    void changeProfile_updatesDisplayNameOnly() {
        Cookie cookie = loginAndCaptureCookie();
        Context ctx = requestWithSession(cookie.getValue());
        when(ctx.bodyAsClass(Map.class)).thenReturn(Map.of("displayName", "  New Name  "));

        controller.changeProfile(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        assertEquals("New Name", saved.getValue().displayName());
        assertEquals(PASSWORD_HASH, saved.getValue().passwordHash(), "password hash must be untouched");
        assertEquals("New Name", capturedJson(ctx).get("displayName"));
    }

    @Test
    void changeProfile_newPasswordWithoutCurrent_400() {
        Cookie cookie = loginAndCaptureCookie();
        Context ctx = requestWithSession(cookie.getValue());
        when(ctx.bodyAsClass(Map.class)).thenReturn(Map.of("newPassword", "next-pw"));

        controller.changeProfile(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(userRepo, never()).save(any());
    }

    @Test
    void changeProfile_wrongCurrentPassword_401() {
        Cookie cookie = loginAndCaptureCookie();
        Context ctx = requestWithSession(cookie.getValue());
        when(ctx.bodyAsClass(Map.class)).thenReturn(
                Map.of("currentPassword", "wrong-pw", "newPassword", "next-pw"));

        controller.changeProfile(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(userRepo, never()).save(any());
    }

    @Test
    void changeProfile_changesPassword_whenCurrentPasswordCorrect() {
        Cookie cookie = loginAndCaptureCookie();
        Context ctx = requestWithSession(cookie.getValue());
        when(ctx.bodyAsClass(Map.class)).thenReturn(
                Map.of("currentPassword", PASSWORD, "newPassword", "next-pw"));

        controller.changeProfile(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        assertNotEquals(PASSWORD_HASH, saved.getValue().passwordHash());
        assertTrue(BCrypt.verifyer()
                        .verify("next-pw".toCharArray(), saved.getValue().passwordHash()).verified,
                "saved hash must verify the new password");
    }

    @Test
    void changeProfile_userDeletedMeanwhile_404() {
        Cookie cookie = loginAndCaptureCookie();
        when(userRepo.findById("admin")).thenReturn(Optional.empty());
        Context ctx = requestWithSession(cookie.getValue());

        controller.changeProfile(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }
}
