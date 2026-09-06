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
import com.report.server.auth.AuthMode;
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
        when(userRepo.findByExternalId(anyString())).thenReturn(Optional.empty());
        authCtrl = new AuthController(userRepo, now::get, AuthMode.BOTH);
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
        verify(userRepo).saveOrThrow(saved.capture());
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
        verify(userRepo).saveOrThrow(saved.capture());
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
        verify(userRepo).saveOrThrow(saved.capture());
        assertEquals(Set.of("user"), saved.getValue().roles());
        assertEquals("/", redirectTarget(ctx));
    }

    @Test
    void callbackRefreshesRolesFromIdpButKeepsLocallyEditedDisplayName() throws Exception {
        // M6: the IdP owns roles; the display name is editable in the account settings
        UserRecord existing =
                new UserRecord(
                        "alice",
                        "Edited Name",
                        null,
                        Set.of("user"),
                        UserRecord.PROVIDER_OIDC,
                        "alice");
        when(userRepo.findByExternalId("alice")).thenReturn(Optional.of(existing));
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
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).saveOrThrow(saved.capture());
        assertEquals("Edited Name", saved.getValue().displayName());
        assertEquals(Set.of("admin", "user"), saved.getValue().roles());
        assertEquals("/", redirectTarget(ctx));

        // unchanged roles → no write at all
        Map<String, String> q2 = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q2.get("nonce"))
                                .build()));
        c.callback(callbackCtx(q2.get("state"), q2.get("state"), "code"));
        verify(userRepo, org.mockito.Mockito.times(1)).saveOrThrow(any());
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

        verify(userRepo, never()).saveOrThrow(any());
        assertEquals("/?oidc_error=" + OidcController.ERR_USER_CONFLICT, redirectTarget(ctx));
        verify(ctx, never()).cookie(any(Cookie.class));
    }

    @Test
    void callbackNeverLinksImplicitlyEvenWhenLinkingIsEnabled() throws Exception {
        // H1: username equality alone must never attach an IdP identity to a local account
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
        verify(userRepo, never()).saveOrThrow(any());
        assertEquals("/?oidc_error=" + OidcController.ERR_USER_CONFLICT, redirectTarget(ctx));
        verify(ctx, never()).cookie(any(Cookie.class));
    }

    /** Logs a local user in and returns the session cookie value. */
    private String localSession(String userId, Set<String> roles) {
        Context login = mock(Context.class);
        authCtrl.loginExternal(
                login,
                new Principal(userId, "Local " + userId, roles, Principal.PROVIDER_LOCAL),
                null);
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(login).cookie(cookie.capture());
        return cookie.getValue().getValue();
    }

    /**
     * GET /oidc/login?link=1 with a session cookie; returns the redirect query (or null on error
     * redirect).
     */
    private Map<String, String> startLink(
            OidcController c, String sessionId, ArgumentCaptor<String> redirect) {
        Context ctx = mock(Context.class);
        when(ctx.queryParam("link")).thenReturn("1");
        when(ctx.cookie("session_id")).thenReturn(sessionId);
        c.login(ctx);
        verify(ctx).redirect(redirect.capture(), eq(HttpStatus.FOUND));
        String url = redirect.getValue();
        if (!url.startsWith(MD.authorizationEndpoint() + "?")) return null;
        Map<String, String> q = new HashMap<>();
        for (String kv : URI.create(url).getRawQuery().split("&")) {
            String[] p = kv.split("=", 2);
            q.put(p[0], java.net.URLDecoder.decode(p[1], java.nio.charset.StandardCharsets.UTF_8));
        }
        return q;
    }

    @Test
    void explicitLinkAttachesExternalIdToTheLoggedInLocalUser() throws Exception {
        UserRecord local = new UserRecord("alice", "Local alice", "hash", Set.of("admin", "user"));
        when(userRepo.findById("alice")).thenReturn(Optional.of(local));
        OidcController c = controller(Map.of("OIDC_LINK_LOCAL_USERS", "true"));
        String session = localSession("alice", Set.of("admin", "user"));

        Map<String, String> q = startLink(c, session, ArgumentCaptor.forClass(String.class));
        assertNotNull(q, "link flow must redirect to the provider");
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("sub-alice", now.get())
                                .claim("preferred_username", "alice")
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        when(ctx.cookie("session_id")).thenReturn(session);
        c.callback(ctx);

        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).saveOrThrow(saved.capture());
        UserRecord u = saved.getValue();
        assertEquals("hash", u.passwordHash());
        assertEquals(UserRecord.PROVIDER_LOCAL, u.provider());
        assertEquals("sub-alice", u.externalId());
        assertEquals(Set.of("admin", "user"), u.roles());
        assertEquals("/?oidc_linked=1", redirectTarget(ctx));
        // the existing local session is kept (no new session cookie)
        verify(ctx, never()).cookie(any(Cookie.class));

        // a later plain OIDC login resolves the linked account by sub, keeps the password
        when(userRepo.findByExternalId("sub-alice")).thenReturn(Optional.of(u));
        Map<String, String> q2 = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("sub-alice", now.get())
                                .claim("preferred_username", "alice")
                                .claim("nonce", q2.get("nonce"))
                                .build()));
        Context ctx2 = callbackCtx(q2.get("state"), q2.get("state"), "code");
        c.callback(ctx2);
        assertEquals("/", redirectTarget(ctx2));
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(ctx2).cookie(cookie.capture());
        Context later = mock(Context.class);
        when(later.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        Principal p = authCtrl.resolveFromRequest(later);
        assertEquals("alice", p.userId());
        assertEquals(Principal.PROVIDER_OIDC, p.provider());
    }

    @Test
    void explicitLinkRequiresAnActiveLocalSessionAndTheFeatureFlag() {
        OidcController enabled = controller(Map.of("OIDC_LINK_LOCAL_USERS", "true"));
        ArgumentCaptor<String> r1 = ArgumentCaptor.forClass(String.class);
        assertNull(startLink(enabled, null, r1));
        assertEquals("/?oidc_error=" + OidcController.ERR_LINK_UNAUTHORIZED, r1.getValue());

        OidcController disabled = controller(Map.of());
        String session = localSession("alice", Set.of("user"));
        ArgumentCaptor<String> r2 = ArgumentCaptor.forClass(String.class);
        assertNull(startLink(disabled, session, r2));
        assertEquals("/?oidc_error=" + OidcController.ERR_LINK_DISABLED, r2.getValue());
    }

    @Test
    void explicitLinkRefusesSubjectAlreadyBoundToAnotherAccountAndSessionChanges()
            throws Exception {
        UserRecord local = new UserRecord("alice", "Local alice", "hash", Set.of("user"));
        when(userRepo.findById("alice")).thenReturn(Optional.of(local));
        when(userRepo.findByExternalId("sub-x"))
                .thenReturn(
                        Optional.of(
                                new UserRecord(
                                        "bob",
                                        "Bob",
                                        null,
                                        Set.of("user"),
                                        UserRecord.PROVIDER_OIDC,
                                        "sub-x")));
        OidcController c = controller(Map.of("OIDC_LINK_LOCAL_USERS", "true"));
        String session = localSession("alice", Set.of("user"));

        // sub already belongs to bob → conflict, nothing saved
        Map<String, String> q = startLink(c, session, ArgumentCaptor.forClass(String.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("sub-x", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        when(ctx.cookie("session_id")).thenReturn(session);
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_USER_CONFLICT, redirectTarget(ctx));

        // session gone between login and callback → unauthorized, nothing saved
        Map<String, String> q2 = startLink(c, session, ArgumentCaptor.forClass(String.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("sub-new", now.get())
                                .claim("nonce", q2.get("nonce"))
                                .build()));
        Context ctx2 = callbackCtx(q2.get("state"), q2.get("state"), "code");
        when(ctx2.cookie("session_id")).thenReturn("stale-session");
        c.callback(ctx2);
        assertEquals("/?oidc_error=" + OidcController.ERR_LINK_UNAUTHORIZED, redirectTarget(ctx2));
        verify(userRepo, never()).saveOrThrow(any());
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
        verify(userRepo, never()).saveOrThrow(any());
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
        verify(userRepo, never()).saveOrThrow(any());
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
    void bearerAccessTokenResolvesExistingAccountWithoutTouchingTheStore() throws Exception {
        when(userRepo.findByExternalId("carol"))
                .thenReturn(
                        Optional.of(
                                new UserRecord(
                                        "carol",
                                        "Carol",
                                        null,
                                        Set.of("user"),
                                        UserRecord.PROVIDER_OIDC,
                                        "carol")));
        OidcController c = controller(Map.of());
        String at =
                keys.sign(
                        OidcTestKeys.claims("carol", now.get())
                                .audience(List.of("account"))
                                .claim("azp", OidcTestKeys.CLIENT)
                                .claim(
                                        "realm_access",
                                        Map.of("roles", List.of("report-studio-admin")))
                                .build());
        Context ctx = mock(Context.class);
        when(ctx.header("Authorization")).thenReturn("Bearer " + at);
        Principal p = c.resolveFromBearer(ctx);
        assertEquals("carol", p.userId());
        assertEquals(Principal.PROVIDER_OIDC, p.provider());
        assertEquals(Set.of("admin", "user"), p.roles()); // roles follow the current token
        verify(userRepo, never()).saveOrThrow(any());
    }

    @Test
    void bearerNeverProvisionsOrLinksAccounts() throws Exception {
        // H1: an API token alone must not create an account, nor attach itself to a local one
        when(userRepo.findById("admin"))
                .thenReturn(
                        Optional.of(
                                new UserRecord("admin", "管理者", "hash", Set.of("admin", "user"))));
        OidcController c = controller(Map.of("OIDC_LINK_LOCAL_USERS", "true"));
        for (String sub : List.of("carol", "admin")) {
            String at =
                    keys.sign(
                            OidcTestKeys.claims(sub, now.get())
                                    .audience(List.of("account"))
                                    .claim("azp", OidcTestKeys.CLIENT)
                                    .build());
            Context ctx = mock(Context.class);
            when(ctx.header("Authorization")).thenReturn("Bearer " + at);
            assertTrue(c.resolveFromBearer(ctx).isAnonymous(), sub);
        }
        verify(userRepo, never()).saveOrThrow(any());
    }

    @Test
    void bearerSwallowsRepositoryFailures() throws Exception {
        // resolveFromBearer must never throw (the before-filter turns ANONYMOUS into 401)
        when(userRepo.findByExternalId(anyString()))
                .thenThrow(
                        new com.report.server.JsonBlobRepository.RepositoryException(
                                "db down", null));
        OidcController c = controller(Map.of());
        String at =
                keys.sign(
                        OidcTestKeys.claims("carol", now.get())
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        Context ctx = mock(Context.class);
        when(ctx.header("Authorization")).thenReturn("Bearer " + at);
        assertTrue(c.resolveFromBearer(ctx).isAnonymous());
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
        verify(userRepo, never()).saveOrThrow(any());
    }

    // ── token exchange / persistence failures (M3, M4, M9) ─────────────────

    private OidcController controllerWithExchanger(OidcController.TokenExchanger ex) {
        return new OidcController(
                OidcTestKeys.config(Map.of()),
                userRepo,
                authCtrl,
                cfg -> MD,
                ex,
                (cfg, md) -> keys.verifier(),
                now::get);
    }

    @Test
    void callbackMapsTokenEndpointRejectionToInvalidToken() {
        OidcController c =
                controllerWithExchanger(
                        (md, code, v) -> {
                            throw new OidcController.TokenExchangeException(400, "invalid_grant");
                        });
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_TOKEN, redirectTarget(ctx));
    }

    @Test
    void callbackMapsMissingIdTokenAndUnexpectedFailuresToProviderError() {
        OidcController noId =
                controllerWithExchanger(
                        (md, code, v) -> new OidcController.TokenResponse(null, "at"));
        Map<String, String> q = startLogin(noId, ArgumentCaptor.forClass(Cookie.class));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        noId.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_PROVIDER, redirectTarget(ctx));

        OidcController boom =
                controllerWithExchanger(
                        (md, code, v) -> {
                            throw new IllegalArgumentException("bad token_endpoint URL");
                        });
        Map<String, String> q2 = startLogin(boom, ArgumentCaptor.forClass(Cookie.class));
        Context ctx2 = callbackCtx(q2.get("state"), q2.get("state"), "code");
        boom.callback(ctx2); // must redirect, never surface a JSON 500 to a navigating browser
        assertEquals("/?oidc_error=" + OidcController.ERR_PROVIDER, redirectTarget(ctx2));
    }

    @Test
    void callbackReportsUnavailableWhenTheAccountCannotBePersisted() throws Exception {
        org.mockito.Mockito.doThrow(
                        new com.report.server.JsonBlobRepository.RepositoryException(
                                "commit conflict", null))
                .when(userRepo)
                .saveOrThrow(any());
        OidcController c = controller(Map.of());
        Map<String, String> q = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        nextIdToken.set(
                keys.sign(
                        OidcTestKeys.claims("alice", now.get())
                                .claim("nonce", q.get("nonce"))
                                .build()));
        Context ctx = callbackCtx(q.get("state"), q.get("state"), "code");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_UNAVAILABLE, redirectTarget(ctx));
        verify(ctx, never()).cookie(any(Cookie.class)); // no session for an unsaved account
    }

    @Test
    void defaultExchangerClassifiesTokenEndpointResponses() throws Exception {
        com.sun.net.httpserver.HttpServer server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        java.util.concurrent.atomic.AtomicReference<String> mode =
                new java.util.concurrent.atomic.AtomicReference<>("ok");
        server.createContext(
                "/token",
                ex -> {
                    String body;
                    int status;
                    switch (mode.get()) {
                        case "reject" -> {
                            status = 400;
                            body =
                                    "{\"error\":\"invalid_grant\",\"error_description\":\"Code not valid\"}";
                        }
                        case "error200" -> {
                            status = 200;
                            body = "{\"error\":\"server_error\"}";
                        }
                        default -> {
                            status = 200;
                            body = "{\"id_token\":\"a.b.c\",\"access_token\":\"x.y.z\"}";
                        }
                    }
                    byte[] bytes = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    ex.getResponseHeaders().add("Content-Type", "application/json");
                    ex.sendResponseHeaders(status, bytes.length);
                    try (var os = ex.getResponseBody()) {
                        os.write(bytes);
                    }
                });
        server.start();
        try {
            OidcMetadata md =
                    new OidcMetadata(
                            OidcTestKeys.ISSUER,
                            MD.authorizationEndpoint(),
                            "http://127.0.0.1:" + server.getAddress().getPort() + "/token",
                            MD.jwksUri(),
                            null);
            OidcController.TokenExchanger ex =
                    OidcController.defaultExchanger(OidcTestKeys.config(Map.of()));
            OidcController.TokenResponse ok = ex.exchange(md, "code", "verifier");
            assertEquals("a.b.c", ok.idToken());
            assertEquals("x.y.z", ok.accessToken());

            mode.set("reject");
            var rejected =
                    org.junit.jupiter.api.Assertions.assertThrows(
                            OidcController.TokenExchangeException.class,
                            () -> ex.exchange(md, "code", "verifier"));
            assertEquals(400, rejected.status());
            assertEquals("invalid_grant", rejected.error());

            mode.set("error200");
            org.junit.jupiter.api.Assertions.assertThrows(
                    OidcController.TokenExchangeException.class,
                    () -> ex.exchange(md, "code", "verifier"));
        } finally {
            server.stop(0);
        }
    }

    // ── abuse resistance (M7) ────────────────────────────────────────────────

    @Test
    void pendingFlowsAreBoundedOldestFirst() {
        OidcController c = controller(Map.of());
        c.setLoginLimiter(new com.report.server.auth.RateLimiter(Integer.MAX_VALUE, 60_000L));
        Map<String, String> first = startLogin(c, ArgumentCaptor.forClass(Cookie.class));
        for (int i = 0; i < OidcController.MAX_PENDING_FLOWS; i++) {
            c.login(mock(Context.class));
        }
        // the very first state has been evicted to make room
        Context ctx = callbackCtx(first.get("state"), first.get("state"), "code");
        c.callback(ctx);
        assertEquals("/?oidc_error=" + OidcController.ERR_STATE, redirectTarget(ctx));
    }

    @Test
    void loginIsRateLimitedPerClientIp() {
        OidcController c = controller(Map.of());
        c.setLoginLimiter(new com.report.server.auth.RateLimiter(2, 60_000L));
        for (int i = 0; i < 2; i++) {
            Context ctx = mock(Context.class);
            when(ctx.ip()).thenReturn("10.0.0.9");
            c.login(ctx);
            ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
            verify(ctx).redirect(url.capture(), eq(HttpStatus.FOUND));
            assertTrue(url.getValue().startsWith(MD.authorizationEndpoint()));
        }
        Context third = mock(Context.class);
        when(third.ip()).thenReturn("10.0.0.9");
        c.login(third);
        assertEquals("/?oidc_error=" + OidcController.ERR_RATE_LIMITED, redirectTarget(third));
        Context other = mock(Context.class);
        when(other.ip()).thenReturn("10.0.0.10");
        c.login(other);
        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        verify(other).redirect(url.capture(), eq(HttpStatus.FOUND));
        assertTrue(url.getValue().startsWith(MD.authorizationEndpoint()));
    }

    // ── Bearer result cache (M2) ─────────────────────────────────────────────

    @Test
    void bearerResolutionIsCachedUntilTheTokenExpires() throws Exception {
        UserRecord carol =
                new UserRecord(
                        "carol", "Carol", null, Set.of("user"), UserRecord.PROVIDER_OIDC, "carol");
        when(userRepo.findByExternalId("carol")).thenReturn(Optional.of(carol));
        OidcController c = controller(Map.of());
        String at =
                keys.sign(
                        OidcTestKeys.claims("carol", now.get())
                                .expirationTime(new java.util.Date(now.get() + 60_000L))
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        for (int i = 0; i < 3; i++) {
            Context ctx = mock(Context.class);
            when(ctx.header("Authorization")).thenReturn("Bearer " + at);
            assertEquals("carol", c.resolveFromBearer(ctx).userId());
        }
        verify(userRepo, org.mockito.Mockito.times(1)).findByExternalId("carol");

        now.addAndGet(61_000L); // past exp on the controller clock → cache entry discarded …
        Context late = mock(Context.class);
        when(late.header("Authorization")).thenReturn("Bearer " + at);
        c.resolveFromBearer(late);
        // … so the account is looked up again (nimbus validates exp against the wall clock)
        verify(userRepo, org.mockito.Mockito.times(2)).findByExternalId("carol");
    }

    // ── discovery resilience (H3) ─────────────────────────────────────────────

    private OidcController controllerWithSource(OidcController.MetadataSource source) {
        return new OidcController(
                OidcTestKeys.config(Map.of()),
                userRepo,
                authCtrl,
                source,
                (md, code, verifier) -> new OidcController.TokenResponse(nextIdToken.get(), "at"),
                (cfg, md) -> keys.verifier(),
                now::get);
    }

    @Test
    void discoveryFailureIsCachedForTheBackoffWindow() {
        java.util.concurrent.atomic.AtomicInteger calls =
                new java.util.concurrent.atomic.AtomicInteger();
        OidcController c =
                controllerWithSource(
                        cfg -> {
                            calls.incrementAndGet();
                            throw new java.io.IOException("connection refused");
                        });
        for (int i = 0; i < 3; i++) {
            Context ctx = mock(Context.class);
            c.login(ctx);
            assertEquals("/?oidc_error=" + OidcController.ERR_UNAVAILABLE, redirectTarget(ctx));
        }
        assertEquals(
                1, calls.get(), "only the first call within the backoff window hits the network");

        now.addAndGet(OidcController.DISCOVERY_BACKOFF_MS + 1);
        Context ctx = mock(Context.class);
        c.login(ctx);
        assertEquals(2, calls.get(), "after the backoff the discovery is retried");
    }

    @Test
    void callersDoNotQueueBehindAnInFlightDiscovery() throws Exception {
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        OidcController c =
                controllerWithSource(
                        cfg -> {
                            entered.countDown();
                            try {
                                release.await(); // simulates a hanging provider
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                            return MD;
                        });
        Thread slow = new Thread(() -> c.login(mock(Context.class)));
        slow.start();
        assertTrue(entered.await(5, java.util.concurrent.TimeUnit.SECONDS));

        // While discovery hangs, a Bearer caller must be answered immediately, not serialized
        String at =
                keys.sign(
                        OidcTestKeys.claims("carol", now.get())
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        Context bearer = mock(Context.class);
        when(bearer.header("Authorization")).thenReturn("Bearer " + at);
        // Run the Bearer resolution on its own thread so a regression (lock convoy) fails the
        // test by timeout instead of hanging the whole suite.
        java.util.concurrent.CompletableFuture<Principal> answer =
                java.util.concurrent.CompletableFuture.supplyAsync(
                        () -> c.resolveFromBearer(bearer));
        try {
            assertTrue(
                    answer.get(2, java.util.concurrent.TimeUnit.SECONDS).isAnonymous(),
                    "must answer while discovery hangs");
        } catch (java.util.concurrent.TimeoutException e) {
            throw new AssertionError("Bearer caller queued behind the in-flight discovery", e);
        } finally {
            release.countDown();
            slow.join(5_000);
        }
        assertFalse(slow.isAlive());
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
