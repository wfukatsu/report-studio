package com.report.server;

import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
import com.report.server.auth.UserRecord;
import com.report.server.auth.UserRepository;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Unit tests for {@link ApiTokenController} — Bearer resolution + management (#195). */
class ApiTokenControllerTest {

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

    private Context ctx() { return mock(Context.class); }

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
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(new Principal("admin", "管理者", Set.of("admin")));
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
        assertFalse(json.getValue().contains(plaintext), "stored record must not hold the plaintext");
        assertEquals(ApiTokenController.sha256(plaintext), id.getValue(), "id must be the token hash");
    }

    @Test
    void revoke_otherUsersToken_returns404() {
        Context ctx = ctx();
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.pathParam("id")).thenReturn("somehash");
        when(tokenRepo.get("somehash")).thenReturn(Optional.of("{\"userId\":\"other\"}"));

        controller.revoke(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void revoke_ownToken_success() {
        Context ctx = ctx();
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(new Principal("admin", "管理者", Set.of("admin")));
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
     * Issue #206: a failed delete must NOT report success — otherwise a "revoked" token
     * stays usable for Bearer auth. The controller returns 500 and never emits revoked:true.
     */
    @Test
    void revoke_deleteFails_returns500_notFalseSuccess() {
        Context ctx = ctx();
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(new Principal("admin", "管理者", Set.of("admin")));
        when(ctx.pathParam("id")).thenReturn("myhash");
        when(tokenRepo.get("myhash")).thenReturn(Optional.of("{\"userId\":\"admin\"}"));
        org.mockito.Mockito.doThrow(new JsonBlobRepository.RepositoryException("db down", new RuntimeException()))
                .when(tokenRepo).delete("myhash");

        controller.revoke(ctx);

        verify(ctx).status(HttpStatus.INTERNAL_SERVER_ERROR);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> resp = ArgumentCaptor.forClass(Map.class);
        verify(ctx).json(resp.capture());
        assertNull(resp.getValue().get("revoked"), "must not report revoked:true on a failed delete");
    }
}
