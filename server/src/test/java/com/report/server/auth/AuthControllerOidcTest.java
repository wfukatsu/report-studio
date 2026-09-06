package com.report.server.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import at.favre.lib.crypto.bcrypt.BCrypt;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.HttpStatus;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** #499 additions to {@link AuthController}: local-login switch, OIDC sessions, /me shape. */
class AuthControllerOidcTest {

    private static final String HASH = BCrypt.withDefaults().hashToString(4, "pw".toCharArray());
    private static final UserRecord LOCAL =
            new UserRecord("admin", "管理者", HASH, Set.of("admin", "user"));
    private static final UserRecord OIDC_USER =
            new UserRecord(
                    "alice", "Alice", null, Set.of("user"), UserRecord.PROVIDER_OIDC, "sub-1");

    private UserRepository userRepo;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        userRepo = mock(UserRepository.class);
        when(userRepo.findById("admin")).thenReturn(Optional.of(LOCAL));
        when(userRepo.findById("alice")).thenReturn(Optional.of(OIDC_USER));
        controller = new AuthController(userRepo, System::currentTimeMillis, AuthMode.BOTH);
    }

    @AfterEach
    void tearDown() {
        controller.shutdown();
    }

    private static Context loginCtx(String userId, String password) {
        Context ctx = mock(Context.class);
        when(ctx.ip()).thenReturn("10.0.0.1");
        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("password", password);
        when(ctx.bodyAsClass(Map.class)).thenReturn(body);
        return ctx;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> json(Context ctx) {
        ArgumentCaptor<Object> c = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(c.capture());
        return (Map<String, Object>) c.getValue();
    }

    @Test
    void passwordLoginIsRefusedWhenLocalLoginDisabled() {
        controller.shutdown();
        controller = new AuthController(userRepo, System::currentTimeMillis, AuthMode.OIDC);
        Context ctx = loginCtx("admin", "pw");
        controller.login(ctx);
        verify(ctx).status(HttpStatus.FORBIDDEN);
        assertEquals("LOCAL_LOGIN_DISABLED", json(ctx).get("code"));
        assertFalse(controller.isLocalLoginEnabled());
    }

    @Test
    void passwordLoginIsRefusedForPasswordlessOidcAccount() {
        Context ctx = loginCtx("alice", "anything");
        controller.login(ctx);
        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(ctx, never()).cookie(any(Cookie.class));
    }

    @Test
    void meAdvertisesSignInMethodsEvenWhenAnonymous() {
        Context ctx = mock(Context.class);
        controller.me(ctx);
        Map<String, Object> body = json(ctx);
        assertEquals(true, body.get("anonymous"));
        assertEquals(Principal.PROVIDER_NONE, body.get("provider"));
        assertEquals(false, body.get("hasPassword"));
        @SuppressWarnings("unchecked")
        Map<String, Object> auth = (Map<String, Object>) body.get("auth");
        assertEquals("both", auth.get("mode"));
        assertEquals(true, auth.get("localLoginEnabled"));
        assertEquals(false, auth.get("oidcEnabled"));
        assertNull(auth.get("oidcLoginUrl"));

        controller.enableOidc(hint -> "https://kc/logout?hint=" + hint, true);
        Context ctx2 = mock(Context.class);
        controller.me(ctx2);
        @SuppressWarnings("unchecked")
        Map<String, Object> auth2 = (Map<String, Object>) json(ctx2).get("auth");
        assertEquals(true, auth2.get("oidcEnabled"));
        assertEquals("/api/v1/auth/oidc/login", auth2.get("oidcLoginUrl"));
        assertEquals(true, auth2.get("oidcLinkEnabled"));
        assertEquals(false, json(ctx2).get("oidcLinked"));
    }

    @Test
    void localLoginReportsProviderAndHasPassword() {
        Context ctx = loginCtx("admin", "pw");
        controller.login(ctx);
        Map<String, Object> body = json(ctx);
        assertEquals(Principal.PROVIDER_LOCAL, body.get("provider"));
        assertEquals(true, body.get("hasPassword"));
        assertEquals(false, body.get("anonymous"));
    }

    @Test
    void oidcSessionLogoutReturnsProviderLogoutUrl() {
        controller.enableOidc(hint -> "https://kc/logout?hint=" + hint);
        Principal alice = new Principal("alice", "Alice", Set.of("user"), Principal.PROVIDER_OIDC);
        Context login = mock(Context.class);
        controller.loginExternal(login, alice, "idtok");
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(login).cookie(cookie.capture());

        // /me on that session reports provider=oidc, hasPassword=false
        Context me = mock(Context.class);
        when(me.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        controller.me(me);
        Map<String, Object> body = json(me);
        assertEquals(Principal.PROVIDER_OIDC, body.get("provider"));
        assertEquals(false, body.get("hasPassword"));
        assertEquals(false, body.get("oidcLinked")); // provisioned, not "linked"

        Context logout = mock(Context.class);
        when(logout.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        controller.logout(logout);
        Map<String, Object> out = json(logout);
        assertEquals("logged_out", out.get("status"));
        assertEquals("https://kc/logout?hint=idtok", out.get("logoutUrl"));

        // and the session is gone
        Context after = mock(Context.class);
        when(after.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        assertTrue(controller.resolveFromRequest(after).isAnonymous());
    }

    @Test
    void localSessionLogoutHasNoProviderLogoutUrl() {
        controller.enableOidc(hint -> "https://kc/logout");
        Context ctx = loginCtx("admin", "pw");
        controller.login(ctx);
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(ctx).cookie(cookie.capture());
        Context logout = mock(Context.class);
        when(logout.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        controller.logout(logout);
        assertNull(json(logout).get("logoutUrl"));
    }

    @Test
    void passwordChangeIsRefusedForOidcAccount() {
        Principal alice = new Principal("alice", "Alice", Set.of("user"), Principal.PROVIDER_OIDC);
        Context login = mock(Context.class);
        controller.loginExternal(login, alice, null);
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(login).cookie(cookie.capture());

        Context ctx = mock(Context.class);
        when(ctx.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        Map<String, Object> body = new HashMap<>();
        body.put("currentPassword", "x");
        body.put("newPassword", "new-password-1");
        when(ctx.bodyAsClass(Map.class)).thenReturn(body);
        controller.changeProfile(ctx);
        verify(ctx).status(HttpStatus.FORBIDDEN);
        assertEquals("PASSWORD_MANAGED_EXTERNALLY", json(ctx).get("detailCode"));
        verify(userRepo, never()).save(any());
    }

    @Test
    void displayNameChangePreservesProviderAndExternalId() {
        Principal alice = new Principal("alice", "Alice", Set.of("user"), Principal.PROVIDER_OIDC);
        Context login = mock(Context.class);
        controller.loginExternal(login, alice, null);
        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(login).cookie(cookie.capture());

        Context ctx = mock(Context.class);
        when(ctx.cookie("session_id")).thenReturn(cookie.getValue().getValue());
        Map<String, Object> body = new HashMap<>();
        body.put("displayName", "Alice B.");
        when(ctx.bodyAsClass(Map.class)).thenReturn(body);
        controller.changeProfile(ctx);
        ArgumentCaptor<UserRecord> saved = ArgumentCaptor.forClass(UserRecord.class);
        verify(userRepo).save(saved.capture());
        assertEquals(UserRecord.PROVIDER_OIDC, saved.getValue().provider());
        assertEquals("sub-1", saved.getValue().externalId());
        assertNull(saved.getValue().passwordHash());
        assertEquals(Principal.PROVIDER_OIDC, json(ctx).get("provider"));
    }
}
