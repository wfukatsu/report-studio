package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.AdminUserController;
import com.report.server.auth.Principal;
import com.report.server.auth.UserRecord;
import com.report.server.auth.UserRepository;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AdminUserControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private UserRepository userRepo;
    private AdminUserController controller;
    private Context ctx;
    private Principal adminPrincipal;
    private Principal userPrincipal;

    @BeforeEach
    void setUp() {
        userRepo = mock(UserRepository.class);
        controller = new AdminUserController(userRepo);
        ctx = mock(Context.class);
        adminPrincipal = new Principal("admin", "管理者", Set.of("admin", "user"));
        userPrincipal = new Principal("user1", "一般ユーザー", Set.of("user"));
    }

    // ── admin required ────────────────────────────────────────────────────────
    // Admin role enforcement is no longer inside the controller: it lives in the
    // ApiRoutes before-filter for /api/v1/admin/* (ApiRoutes.requireAdminRole).
    // These tests exercise that filter directly.

    @Test
    void adminFilter_rejectsNonAdminPrincipal() {
        when(ctx.attribute("principal")).thenReturn(userPrincipal);
        assertThrows(
                io.javalin.http.ForbiddenResponse.class, () -> ApiRoutes.requireAdminRole(ctx));
    }

    @Test
    void adminFilter_rejectsMissingPrincipal() {
        when(ctx.attribute("principal")).thenReturn(null);
        assertThrows(
                io.javalin.http.ForbiddenResponse.class, () -> ApiRoutes.requireAdminRole(ctx));
    }

    @Test
    void adminFilter_rejectsAnonymousPrincipal() {
        when(ctx.attribute("principal")).thenReturn(Principal.ANONYMOUS);
        assertThrows(
                io.javalin.http.ForbiddenResponse.class, () -> ApiRoutes.requireAdminRole(ctx));
    }

    @Test
    void adminFilter_allowsAdminPrincipal() {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        assertDoesNotThrow(() -> ApiRoutes.requireAdminRole(ctx));
    }

    // ── list ──────────────────────────────────────────────────────────────────

    @Test
    void list_returnsUsersWithoutPasswords() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(userRepo.list())
                .thenReturn(
                        List.of(
                                new UserRecord("admin", "管理者", "$2a$hash", Set.of("admin", "user")),
                                new UserRecord("user1", "ユーザー1", "$2a$hash2", Set.of("user"))));

        controller.list(ctx);

        var captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) captor.getValue();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> users = (List<Map<String, Object>>) result.get("users");
        assertEquals(2, users.size());
        // Passwords must not be exposed
        assertFalse(users.get(0).containsKey("passwordHash"));
        assertEquals("admin", users.get(0).get("userId"));
    }

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void create_savesNewUser() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(userRepo.findById("newuser")).thenReturn(Optional.empty());
        when(ctx.bodyAsClass(Map.class))
                .thenReturn(
                        Map.of(
                                "userId", "newuser",
                                "displayName", "新しいユーザー",
                                "password", "password123",
                                "roles", List.of("user")));

        controller.create(ctx);

        verify(userRepo)
                .save(
                        argThat(
                                u ->
                                        u.userId().equals("newuser")
                                                && u.displayName().equals("新しいユーザー")));
        verify(ctx).status(HttpStatus.CREATED);
    }

    @Test
    void create_returns409ForDuplicateUser() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(userRepo.findById("admin"))
                .thenReturn(Optional.of(new UserRecord("admin", "管理者", "hash", Set.of("admin"))));
        when(ctx.bodyAsClass(Map.class))
                .thenReturn(Map.of("userId", "admin", "password", "password123"));

        controller.create(ctx);

        verify(ctx).status(HttpStatus.CONFLICT);
        verify(userRepo, never()).save(any());
    }

    @Test
    void create_returns400ForMissingFields() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.bodyAsClass(Map.class)).thenReturn(Map.of("displayName", "name"));

        controller.create(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    // ── delete ────────────────────────────────────────────────────────────────

    @Test
    void delete_preventsSelfDeletion() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.pathParam("id")).thenReturn("admin");

        controller.delete(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(userRepo, never()).delete(any());
    }

    @Test
    void delete_removesUser() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.pathParam("id")).thenReturn("user1");
        when(userRepo.findById("user1"))
                .thenReturn(Optional.of(new UserRecord("user1", "ユーザー1", "hash", Set.of("user"))));

        controller.delete(ctx);

        verify(userRepo).delete("user1");
        verify(ctx).status(HttpStatus.NO_CONTENT);
    }

    @Test
    void delete_returns404ForUnknownUser() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.pathParam("id")).thenReturn("ghost");
        when(userRepo.findById("ghost")).thenReturn(Optional.empty());

        controller.delete(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }
}
