package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class V2TenantControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository tenantRepo;
    private V2TenantController controller;
    private Context ctx;
    /** PUT /api/v2/tenant requires the admin role, so the happy-path principal is an admin. */
    private Principal adminPrincipal;
    private Principal nonAdminPrincipal;

    @BeforeEach
    void setUp() {
        tenantRepo = mock(JsonBlobRepository.class);
        controller = new V2TenantController(tenantRepo);
        ctx = mock(Context.class);
        adminPrincipal = new Principal("admin1", "管理者", java.util.Set.of("admin", "user"));
        nonAdminPrincipal = new Principal("user1", "testuser", java.util.Set.of("user"));
    }

    // ── GET /api/v2/tenant ────────────────────────────────────────────────────

    @Test
    void get_returnsEmptyObjectWhenNoTenantInfoStored() throws Exception {
        when(tenantRepo.get("singleton")).thenReturn(Optional.empty());

        controller.get(ctx);

        verify(ctx).contentType("application/json");
        var captor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        assertEquals("{}", captor.getValue());
    }

    @Test
    void get_returnsStoredTenantInfo() throws Exception {
        String stored = """
            {"companyName":"株式会社サンプル","phone":"03-1234-5678"}
            """.strip();
        when(tenantRepo.get("singleton")).thenReturn(Optional.of(stored));

        controller.get(ctx);

        verify(ctx).contentType("application/json");
        var captor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode result = MAPPER.readTree(captor.getValue());
        assertEquals("株式会社サンプル", result.path("companyName").asText());
        assertEquals("03-1234-5678", result.path("phone").asText());
    }

    // ── PUT /api/v2/tenant ────────────────────────────────────────────────────

    @Test
    void put_savesTenantInfoAndReturnsIt() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        String body = """
            {"companyName":"テスト株式会社","address":"東京都"}
            """.strip();
        when(ctx.body()).thenReturn(body);

        controller.put(ctx);

        verify(tenantRepo).put(eq("singleton"), anyString());
        verify(ctx).contentType("application/json");
        var captor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode result = MAPPER.readTree(captor.getValue());
        assertEquals("テスト株式会社", result.path("companyName").asText());
    }

    @Test
    void put_returns401WhenUnauthenticated() throws Exception {
        when(ctx.attribute("principal")).thenReturn(null);
        when(ctx.body()).thenReturn("{}");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(tenantRepo, never()).put(any(), any());
    }

    @Test
    void put_returns401ForAnonymousPrincipal() throws Exception {
        when(ctx.attribute("principal")).thenReturn(Principal.ANONYMOUS);
        when(ctx.body()).thenReturn("{}");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(tenantRepo, never()).put(any(), any());
    }

    @Test
    void put_returns403ForNonAdmin() throws Exception {
        when(ctx.attribute("principal")).thenReturn(nonAdminPrincipal);
        when(ctx.body()).thenReturn("{}");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
        verify(tenantRepo, never()).put(any(), any());
    }

    @Test
    void put_returns400ForEmptyBody() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.body()).thenReturn("");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(tenantRepo, never()).put(any(), any());
    }

    @Test
    void put_returns400ForInvalidJson() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.body()).thenReturn("not-valid-json");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(tenantRepo, never()).put(any(), any());
    }

    @Test
    void put_returns400ForJsonArray() throws Exception {
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        when(ctx.body()).thenReturn("[1,2,3]");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(tenantRepo, never()).put(any(), any());
    }

    @Test
    void put_savedDataIsReturnedBySubsequentGet() throws Exception {
        // PUT
        when(ctx.attribute("principal")).thenReturn(adminPrincipal);
        String body = """
            {"companyName":"株式会社テスト"}
            """.strip();
        when(ctx.body()).thenReturn(body);
        controller.put(ctx);

        // Capture what was stored
        var putCaptor = ArgumentCaptor.forClass(String.class);
        verify(tenantRepo).put(eq("singleton"), putCaptor.capture());
        String storedJson = putCaptor.getValue();

        // GET using the stored value
        Context getCtx = mock(Context.class);
        when(tenantRepo.get("singleton")).thenReturn(Optional.of(storedJson));
        controller.get(getCtx);

        var getCaptor = ArgumentCaptor.forClass(String.class);
        verify(getCtx).result(getCaptor.capture());
        JsonNode result = MAPPER.readTree(getCaptor.getValue());
        assertEquals("株式会社テスト", result.path("companyName").asText());
    }
}
