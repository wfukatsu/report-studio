package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.report.server.auth.UserRecord;
import com.report.server.auth.UserRepository;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Unit tests for {@link ApiTokenController} — Bearer resolution + management (#195). */
class ApiTokenControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final UserRecord ADMIN =
            new UserRecord("admin", "管理者", "hash", Set.of("admin", "user"));

    private AuthController authCtrl;
    private UserRepository userRepo;
    private JsonBlobRepository tokenRepo;
    private ApiTokenController controller;

    @BeforeEach
    void setUp() {
        authCtrl = mock(AuthController.class);
        userRepo = mock(UserRepository.class);
        tokenRepo = mock(JsonBlobRepository.class);
        controller = new ApiTokenController(authCtrl, userRepo, tokenRepo);
    }

    private Context ctx() {
        return mock(Context.class);
    }

    // ── Bearer resolution ────────────────────────────────────────────────────

    @Test
    void resolveFromBearer_noHeader_returnsAnonymous() {
        Context ctx = ctx();
        when(ctx.header("Authorization")).thenReturn(null);
        assertTrue(controller.resolveFromBearer(ctx).isAnonymous());
    }

    @Test
    void resolveFromBearer_unknownToken_returnsAnonymous() {
        Context ctx = ctx();
        when(ctx.header("Authorization")).thenReturn("Bearer rpat_unknown");
        when(tokenRepo.get(anyString())).thenReturn(Optional.empty());
        assertTrue(controller.resolveFromBearer(ctx).isAnonymous());
    }

    @Test
    void resolveFromBearer_validToken_returnsPrincipal() {
        String plaintext = "rpat_abcdef";
        String hash = ApiTokenController.sha256(plaintext);
        String record = "{\"id\":\"" + hash + "\",\"userId\":\"admin\",\"lastUsedAt\":0}";
        when(tokenRepo.get(hash)).thenReturn(Optional.of(record));
        when(userRepo.findById("admin")).thenReturn(Optional.of(ADMIN));

        Context ctx = ctx();
        when(ctx.header("Authorization")).thenReturn("Bearer " + plaintext);

        Principal p = controller.resolveFromBearer(ctx);
        assertFalse(p.isAnonymous());
        assertEquals("admin", p.userId());
        assertTrue(p.roles().contains("admin"));
    }

    @Test
    void resolveFromBearer_userDeleted_returnsAnonymous() {
        String plaintext = "rpat_ghost";
        String hash = ApiTokenController.sha256(plaintext);
        when(tokenRepo.get(hash)).thenReturn(Optional.of("{\"userId\":\"gone\"}"));
        when(userRepo.findById("gone")).thenReturn(Optional.empty());

        Context ctx = ctx();
        when(ctx.header("Authorization")).thenReturn("Bearer " + plaintext);
        assertTrue(controller.resolveFromBearer(ctx).isAnonymous());
    }

    // ── Management ───────────────────────────────────────────────────────────

    @Test
    void create_withoutSession_returns401() {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(Principal.ANONYMOUS);
        controller.create(ctx);
        verify(ctx).status(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void create_persistsHashOnly_andReturnsPlaintextOnce() {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.body()).thenReturn("{\"label\":\"ci\"}");

        controller.create(ctx);

        // The stored record must NOT contain the plaintext token.
        ArgumentCaptor<String> id = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(tokenRepo).put(id.capture(), json.capture(), eq("admin"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> resp = ArgumentCaptor.forClass(Map.class);
        verify(ctx).json(resp.capture());
        String plaintext = (String) resp.getValue().get("token");
        assertNotNull(plaintext);
        assertTrue(plaintext.startsWith("rpat_"));
        assertFalse(
                json.getValue().contains(plaintext), "stored record must not hold the plaintext");
        assertEquals(
                ApiTokenController.sha256(plaintext), id.getValue(), "id must be the token hash");
    }

    @Test
    void revoke_otherUsersToken_returns404() {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.pathParam("id")).thenReturn("somehash");
        when(tokenRepo.get("somehash")).thenReturn(Optional.of("{\"userId\":\"other\"}"));

        controller.revoke(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void revoke_ownToken_success() {
        Context ctx = ctx();
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.pathParam("id")).thenReturn("myhash");
        when(tokenRepo.get("myhash")).thenReturn(Optional.of("{\"userId\":\"admin\"}"));

        controller.revoke(ctx);

        verify(tokenRepo).delete("myhash");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> resp = ArgumentCaptor.forClass(Map.class);
        verify(ctx).json(resp.capture());
        assertEquals(Boolean.TRUE, resp.getValue().get("revoked"));
    }

    /**
     * Issue #206: a failed delete must NOT report success — otherwise a "revoked" token stays
     * usable for Bearer auth. The controller returns 500 and never emits revoked:true.
     */
    @Test
    void revoke_deleteFails_returns500_notFalseSuccess() {
        Context ctx = ctx();
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.pathParam("id")).thenReturn("myhash");
        when(tokenRepo.get("myhash")).thenReturn(Optional.of("{\"userId\":\"admin\"}"));
        org.mockito.Mockito.doThrow(
                        new JsonBlobRepository.RepositoryException(
                                "db down", new RuntimeException()))
                .when(tokenRepo)
                .delete("myhash");

        controller.revoke(ctx);

        verify(ctx).status(HttpStatus.INTERNAL_SERVER_ERROR);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> resp = ArgumentCaptor.forClass(Map.class);
        verify(ctx).json(resp.capture());
        assertNull(
                resp.getValue().get("revoked"), "must not report revoked:true on a failed delete");
    }

    // ── Expiry / limits / rate-limit (#209) ────────────────────────────────────

    @Test
    void create_withExpiresInDays_persistsFutureExpiry() throws Exception {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.body()).thenReturn("{\"label\":\"ci\",\"expiresInDays\":30}");

        controller.create(ctx);

        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(tokenRepo).put(anyString(), json.capture(), eq("admin"));
        long expiresAt = MAPPER.readTree(json.getValue()).path("expiresAt").asLong();
        assertTrue(expiresAt > System.currentTimeMillis(), "expiresAt must be a future timestamp");
    }

    @Test
    void create_withoutExpiry_neverExpires() throws Exception {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.body()).thenReturn("{\"label\":\"ci\"}");

        controller.create(ctx);

        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(tokenRepo).put(anyString(), json.capture(), eq("admin"));
        assertEquals(0L, MAPPER.readTree(json.getValue()).path("expiresAt").asLong());
    }

    @Test
    void resolveFromBearer_expiredToken_returnsAnonymous() {
        String plaintext = "rpat_expired";
        String hash = ApiTokenController.sha256(plaintext);
        long past = System.currentTimeMillis() - 1_000;
        when(tokenRepo.get(hash))
                .thenReturn(
                        Optional.of(
                                "{\"id\":\""
                                        + hash
                                        + "\",\"userId\":\"admin\",\"expiresAt\":"
                                        + past
                                        + "}"));

        Context ctx = ctx();
        when(ctx.header("Authorization")).thenReturn("Bearer " + plaintext);

        assertTrue(
                controller.resolveFromBearer(ctx).isAnonymous(),
                "expired token must not authenticate");
    }

    @Test
    void create_atPerUserLimit_returns429_noWrite() {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.body()).thenReturn("{}");
        java.util.List<String> active = new java.util.ArrayList<>();
        for (int i = 0; i < ApiTokenController.MAX_TOKENS_PER_USER; i++) {
            active.add("{\"id\":\"h" + i + "\",\"userId\":\"admin\",\"expiresAt\":0}");
        }
        when(tokenRepo.listByGroupKey("admin")).thenReturn(active);

        controller.create(ctx);

        verify(ctx).status(HttpStatus.TOO_MANY_REQUESTS);
        verify(tokenRepo, never()).put(anyString(), anyString(), anyString());
    }

    @Test
    void create_expiredTokensDoNotCountTowardLimit() {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.body()).thenReturn("{}");
        long past = System.currentTimeMillis() - 1_000;
        java.util.List<String> expired = new java.util.ArrayList<>();
        for (int i = 0; i < ApiTokenController.MAX_TOKENS_PER_USER; i++) {
            expired.add("{\"id\":\"h" + i + "\",\"userId\":\"admin\",\"expiresAt\":" + past + "}");
        }
        when(tokenRepo.listByGroupKey("admin")).thenReturn(expired);

        controller.create(ctx);

        // All existing tokens are expired → creation is allowed.
        verify(tokenRepo).put(anyString(), anyString(), eq("admin"));
    }

    @Test
    void create_rateLimited_returns429() {
        RateLimiter tight = new RateLimiter(1, 60_000L); // one creation per minute
        ApiTokenController limited = new ApiTokenController(authCtrl, userRepo, tokenRepo, tight);

        Context first = ctx();
        when(authCtrl.resolveFromRequest(first))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(first.body()).thenReturn("{}");
        limited.create(first);
        verify(first).status(HttpStatus.CREATED);

        Context second = ctx();
        when(authCtrl.resolveFromRequest(second))
                .thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(second.body()).thenReturn("{}");
        limited.create(second);
        verify(second).status(HttpStatus.TOO_MANY_REQUESTS);
    }
}
