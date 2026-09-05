package com.report.server.auth.oidc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
import com.report.server.auth.UserRecord;
import com.report.server.auth.UserRepository;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.HttpStatus;
import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Browser flow (login redirect → callback → cookie session), provisioning / linking / conflict
 * rules, and Bearer access-token resolution — all against an in-memory JWKS and a fake token
 * endpoint (#499).
 */
class OidcControllerTest {

    private static final OidcMetadata MD =
            new OidcMetadata(
                    OidcTestKeys.ISSUER,
                    OidcTestKeys.ISSUER + "/auth",
                    "http://keycloak:8080/token",
                    "http://keycloak:8080/certs",
                    OidcTestKeys.ISSUER + "/logout");

    private final AtomicLong now = new AtomicLong(System.currentTimeMillis());
    private OidcTestKeys keys;
    private UserRepository userRepo;
    private AuthController authCtrl;

    /** What the fake token endpoint hands back for the next exchange. */
    private final AtomicReference<String> nextIdToken = new AtomicReference<>();

    private final AtomicReference<String> lastCodeVerifier = new AtomicReference<>();

    /** Access token returned next to the ID token (null → an opaque placeholder). */
    private final AtomicReference<String> nextAccessToken = new AtomicReference<>();

    @BeforeEach
    void setUp() throws Exception {
        keys = new OidcTestKeys();
        userRepo = mock(UserRepository.class);
        when(userRepo.findById(anyString())).thenReturn(Optional.empty());
        when(userRepo.findByExternalId(anyString(), anyString())).thenReturn(Optional.empty());
        authCtrl = new AuthController(userRepo, now::get, true);
    }

    @AfterEach
    void tearDown() {
        authCtrl.shutdown();
    }

    private OidcController controller(Map<String, String> extraEnv) {
        return new OidcController(
                OidcTestKeys.config(extraEnv),
                userRepo,
                authCtrl,
                cfg -> MD,
                (md, code, verifier) -> {
                    lastCodeVerifier.set(verifier);
                    String at = nextAccessToken.getAndSet(null);
                    return new OidcController.TokenResponse(
                            nextIdToken.get(), at == null ? "at" : at);
                },
                (cfg, md) -> keys.verifier(),
                now::get);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Runs GET /oidc/login and returns the query params of the redirect. */
    private Map<String, String> startLogin(OidcController c, ArgumentCaptor<Cookie> cookies) {
        Context ctx = mock(Context.class);
        c.login(ctx);
        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        verify(ctx).redirect(url.capture(), eq(HttpStatus.FOUND));
        verify(ctx).cookie(cookies.capture());
        assertTrue(url.getValue().startsWith(MD.authorizationEndpoint() + "?"));
        Map<String, String> q = new HashMap<>();
        for (String kv : URI.create(url.getValue()).getRawQuery().split("&")) {
            String[] p = kv.split("=", 2);
            q.put(p[0], java.net.URLDecoder.decode(p[1], java.nio.charset.StandardCharsets.UTF_8));
        }
        return q;
    }

    private Context callbackCtx(String state, String cookieState, String code) {
        Context ctx = mock(Context.class);
        when(ctx.queryParam("state")).thenReturn(state);
        when(ctx.queryParam("code")).thenReturn(code);
        when(ctx.cookie(OidcController.STATE_COOKIE)).thenReturn(cookieState);
        return ctx;
    }

    private static String redirectTarget(Context ctx) {
        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        verify(ctx).redirect(url.capture(), eq(HttpStatus.FOUND));
        return url.getValue();
    }

    // ── login ────────────────────────────────────────────────────────────────

    @Test
    void loginRedirectsWithPkceStateAndNonceAndPinsStateInCookie() {
        OidcController c = controller(Map.of());
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        Map<String, String> q = startLogin(c, cookie);

        assertEquals("code", q.get("response_type"));
        assertEquals(OidcTestKeys.CLIENT, q.get("client_id"));
        assertEquals("http://app.test/api/v1/auth/oidc/callback", q.get("redirect_uri"));
        assertEquals("openid profile email", q.get("scope"));
        assertEquals("S256", q.get("code_challenge_method"));
        assertNotNull(q.get("nonce"));
        assertNotNull(q.get("code_challenge"));
        assertEquals(q.get("state"), cookie.getValue().getValue());
        assertEquals(OidcController.STATE_COOKIE, cookie.getValue().getName());
        assertTrue(cookie.getValue().isHttpOnly());
        assertEquals(OidcController.COOKIE_PATH, cookie.getValue().getPath());
    }

    // ── callback: happy path + provisioning ──────────────────────────────────

    @Test
    void callbackProvisionsNewOidcUserAndIssuesSession() throws Exception {
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .claim(
                                        "realm_access",
                                        Map.of("roles", List.of("report-studio-admin")))
                                .build()));

        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code-1");
        c.callback(ctx);

        // PKCE verifier bound to this flow was sent to the token endpoint
        assertEquals(OidcController.s256(lastCodeVerifier.get()), q.get("code_challenge"));

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        UserRecord u = saved.getValue();
        assertEquals("alice", u.userId());
        assertEquals("Test alice", u.displayName());
        assertNull(u.passwordHash());
        assertEquals(UserRecord.PROVIDER_OIDC, u.provider());
        assertEquals("alice", u.externalId());
        assertEquals(Set.of("admin", "user"), u.roles());

        assertEquals("/", redirectTarget(ctx));

        // A regular cookie session exists now and carries provider=oidc
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(ctx).cookie(cookie.capture());
        assertEquals("session_id", cookie.getValue().getName());
        Context later = mock(Context.class);
        when(later.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        Principal p = authCtrl.resolveFromRequest(later);
        assertEquals("alice", p.userId());
        assertEquals(Principal.PROVIDER_OIDC, p.provider());
        assertTrue(p.hasRole("admin"));
    }

    @Test
    void callbackTakesRealmRolesFromAccessTokenWhenIdTokenLacksThem() throws Exception {
        // Keycloak default: realm_access only on the access token
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .claim("realm_access", Map.of("roles", List.of()))
                                .build()));
        nextAccessToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .audience(List.of("account"))
                                .claim("azp", OidcTestKeys.CLIENT)
                                .claim(
                                        "realm_access",
                                        Map.of("roles", List.of("report-studio-admin")))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        assertEquals(Set.of("admin", "user"), saved.getValue().roles());
        assertEquals("/", redirectTarget(ctx));
    }

    @Test
    void callbackIgnoresAccessTokenForAnotherSubjectOrBadSignature() throws Exception {
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        // forged access token claiming admin — wrong key → ignored, login still succeeds as user
        nextAccessToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("azp", OidcTestKeys.CLIENT)
                                .claim(
                                        "realm_access",
                                        Map.of("roles", List.of("report-studio-admin")))
                                .build(),
                        keys.rogue));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);
        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        assertEquals(Set.of("user"), saved.getValue().roles());
        assertEquals("/", redirectTarget(ctx));
    }

    @Test
    void callbackRefreshesExistingOidcUserFromIdp() throws Exception {
        UserRecord existing =
                new UserRecord(
                        "alice",
                        "Old Name",
                        null,
                        Set.of("user"),
                        UserRecord.PROVIDER_OIDC,
                        "alice");
        when(userRepo.findByExternalId(UserRecord.PROVIDER_OIDC, "alice"))
                .thenReturn(Optional.of(existing));
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        assertEquals("Test alice", saved.getValue().displayName());
        assertEquals("/", redirectTarget(ctx));
    }

    @Test
    void callbackRefusesLocalUserWithSameIdByDefault() throws Exception {
        when(userRepo.findById("alice"))
                .thenReturn(Optional.of(new UserRecord("alice", "Local", "hash", Set.of("user"))));
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);

        verify(userRepo, never()).save(any());
        assertEquals("/?oidc_error=" + OidcController.ERR_USER_CONFLICT, redirectTarget(ctx));
        verify(ctx, never()).cookie(any(Cookie.class));
    }

    @Test
    void callbackLinksLocalUserWhenEnabledAndKeepsPassword() throws Exception {
        when(userRepo.findById("alice"))
                .thenReturn(
                        Optional.of(
                                new UserRecord("alice", "Local", "hash", Set.of("admin", "user"))));
        OidcController c = controller(Map.of("OIDC_LINK_LOCAL_USERS", "true"));
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        UserRecord u = saved.getValue();
        assertEquals("hash", u.passwordHash());
        assertEquals(UserRecord.PROVIDER_LOCAL, u.provider());
        assertEquals("alice", u.externalId());
        assertEquals("Local", u.displayName());
        assertEquals("/", redirectTarget(ctx));

        // Session roles come from the IdP (no admin role claim → plain user)
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(ctx).cookie(cookie.capture());
        Context later = mock(Context.class);
        when(later.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        assertFalse(authCtrl.resolveFromRequest(later).hasRole("admin"));
    }

    @Test
    void callbackRefusesUserWithoutRequiredRole() throws Exception {
        OidcController c = controller(Map.of("OIDC_USER_ROLE", "rs-user"));
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("bob", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_NO_ROLE, redirectTarget(ctx));
        verify(userRepo, never()).save(any());
    }

    // ── callback: state / token failures ─────────────────────────────────────

    @Test
    void callbackRejectsStateCookieMismatch() {
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        Context ctx = callbackCtx(q.get("state"), "someone-elses-state", "code");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_STATE, redirectTarget(ctx));
    }

    @Test
    void callbackStateIsSingleUseAndExpires() throws Exception {
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        c.callback(callbackCtx(q.get("state"), q.get("state"), "code"));
        // replay
        Context replay = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(replay);
        assertEquals("/?oidc_error=" + OidcController.ERR_STATE, redirectTarget(replay));

        // expiry
        Map<String, String> q2 = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        now.addAndGet(OidcController.FLOW_TTL_MS + 1);
        Context late = callbackCtx(q2.get("state"), q2.get("state"), "code");
        c.callback(late);
        assertEquals("/?oidc_error=" + OidcController.ERR_STATE, redirectTarget(late));
    }

    @Test
    void callbackRejectsIdTokenWithWrongNonce() throws Exception {
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(OidcTestKeys.claims("alice", now.get()).claim("nonce", "stale").build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_TOKEN, redirectTarget(ctx));
        verify(userRepo, never()).save(any());
    }

    @Test
    void callbackSurfacesProviderError() {
        OidcController c = controller(Map.of());
        Context ctx = mock(Context.class);
        when(ctx.queryParam("error")).thenReturn("access_denied");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_PROVIDER, redirectTarget(ctx));
    }

    // ── Bearer ───────────────────────────────────────────────────────────────

    @Test
    void bearerAccessTokenResolvesAndProvisionsPrincipal() throws Exception {
        OidcController c = controller(Map.of());
        String at =
                keys.sign(
                        OidcTestKeys.claims("carol", now.get())
                                .audience(List.of("account"))
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        Context ctx = mock(Context.class);
        when(ctx.header("Authorization")).thenReturn("Bearer " + at);
        Principal p = c.resolveFromBearer(ctx);
        assertEquals("carol", p.userId());
        assertEquals(Principal.PROVIDER_OIDC, p.provider());
        assertEquals(Set.of("user"), p.roles());
        verify(userRepo).save(any());
    }

    @Test
    void bearerIgnoresOpaquePatsAndBadJwts() throws Exception {
        OidcController c = controller(Map.of());
        Context pat = mock(Context.class);
        when(pat.header("Authorization")).thenReturn("Bearer rpat_abcdef");
        assertTrue(c.resolveFromBearer(pat).isAnonymous());

        Context none = mock(Context.class);
        assertTrue(c.resolveFromBearer(none).isAnonymous());

        String forged =
                keys.sign(
                        OidcTestKeys.claims("carol", now.get())
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build(),
                        keys.rogue);
        Context bad = mock(Context.class);
        when(bad.header("Authorization")).thenReturn("Bearer " + forged);
        assertTrue(c.resolveFromBearer(bad).isAnonymous());
        verify(userRepo, never()).save(any());
    }

    // ── logout ───────────────────────────────────────────────────────────────

    @Test
    void logoutUrlUsesEndSessionEndpointOnceDiscovered() {
        OidcController c = controller(Map.of());
        assertNull(c.logoutUrl("x")); // discovery not triggered yet
        c.warmUp();
        String url = c.logoutUrl("id-token");
        assertNotNull(url);
        assertTrue(url.startsWith(MD.endSessionEndpoint() + "?id_token_hint=id-token&"));
        assertTrue(url.contains("client_id=" + OidcTestKeys.CLIENT));
        assertTrue(url.contains("post_logout_redirect_uri=http%3A%2F%2Fapp.test%2F"));
    }
}
