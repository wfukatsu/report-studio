package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import at.favre.lib.crypto.bcrypt.BCrypt;
import com.report.server.TemplateListRepository.FormSettings;
import com.report.server.TemplateListRepository.TemplateMeta;
import com.report.server.auth.FormSessionManager;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * PublicFormController — unauthenticated public form endpoints (#222).
 *
 * <p>These are the highest-exposure endpoints on the server (no admin auth), so the tests
 * concentrate on the security contract: 404 enumeration protection, IP+id rate limiting before any
 * lookup, bcrypt password verification, and session gating of projection/submit for
 * password-protected forms.
 */
class PublicFormControllerTest {

    private static final String TID = "tmpl-abc123";
    private static final String PW_HASH =
            BCrypt.withDefaults().hashToString(4, "secret".toCharArray());

    private TemplateListRepository templateList;
    private ProjectionRepository projRepo;
    private JsonBlobRepository responseRepo;
    private FormSessionManager sessionManager;
    private RateLimiter rateLimiter;
    private PublicFormController controller;

    @BeforeEach
    void setUp() {
        templateList = mock(TemplateListRepository.class);
        projRepo = mock(ProjectionRepository.class);
        responseRepo = mock(JsonBlobRepository.class);
        sessionManager = mock(FormSessionManager.class);
        rateLimiter = mock(RateLimiter.class);
        controller =
                new PublicFormController(
                        templateList, projRepo, responseRepo, sessionManager, rateLimiter);
    }

    private Context ctx() {
        Context ctx = mock(Context.class);
        when(ctx.pathParam("id")).thenReturn(TID);
        when(ctx.ip()).thenReturn("1.2.3.4");
        return ctx;
    }

    private TemplateMeta published(String pwHash) {
        return new TemplateMeta(TID, "見積フォーム", 0L, new FormSettings(true, pwHash, "standard"));
    }

    // ── getFormInfo ─────────────────────────────────────────────────────────

    @Test
    void getFormInfo_unknownTemplate_returns404() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.empty());
        controller.getFormInfo(ctx);
        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void getFormInfo_existsButNotPublished_returns404() {
        // Enumeration protection: unpublished must be indistinguishable from missing.
        Context ctx = ctx();
        when(templateList.findById(TID))
                .thenReturn(
                        Optional.of(
                                new TemplateMeta(
                                        TID, "x", 0L, new FormSettings(false, null, "standard"))));
        controller.getFormInfo(ctx);
        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    @SuppressWarnings("unchecked")
    void getFormInfo_published_reportsPasswordRequirement() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        controller.getFormInfo(ctx);

        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(body.capture());
        Map<String, Object> map = (Map<String, Object>) body.getValue();
        assertEquals(true, map.get("published"));
        assertEquals(true, map.get("passwordRequired"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void getFormInfo_publishedNoPassword_passwordRequiredFalse() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.of(published(null)));
        controller.getFormInfo(ctx);

        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(body.capture());
        assertEquals(false, ((Map<String, Object>) body.getValue()).get("passwordRequired"));
    }

    // ── verifyPassword ──────────────────────────────────────────────────────

    @Test
    void verifyPassword_rateLimited_returns429BeforeAnyLookup() {
        Context ctx = ctx();
        when(rateLimiter.isAllowed("1.2.3.4:" + TID)).thenReturn(false);
        controller.verifyPassword(ctx);
        verify(ctx).status(HttpStatus.TOO_MANY_REQUESTS);
        verify(templateList, never()).findById(anyString());
    }

    @Test
    void verifyPassword_wrongPassword_returns401() {
        Context ctx = ctx();
        when(rateLimiter.isAllowed(anyString())).thenReturn(true);
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        when(ctx.bodyAsClass(Map.class)).thenReturn(Map.of("password", "wrong"));

        controller.verifyPassword(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(sessionManager, never()).createSession(anyString());
    }

    @Test
    void verifyPassword_correctPassword_createsSession() {
        Context ctx = ctx();
        when(rateLimiter.isAllowed(anyString())).thenReturn(true);
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        when(ctx.bodyAsClass(Map.class)).thenReturn(Map.of("password", "secret"));
        when(sessionManager.createSession(TID)).thenReturn("session-token");

        controller.verifyPassword(ctx);

        verify(sessionManager).createSession(TID);
        verify(ctx, never()).status(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void verifyPassword_missingPassword_returns400() {
        Context ctx = ctx();
        when(rateLimiter.isAllowed(anyString())).thenReturn(true);
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        when(ctx.bodyAsClass(Map.class)).thenReturn(Map.of()); // no "password" key

        controller.verifyPassword(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void verifyPassword_noPasswordConfigured_grantsAccess() {
        Context ctx = ctx();
        when(rateLimiter.isAllowed(anyString())).thenReturn(true);
        when(templateList.findById(TID)).thenReturn(Optional.of(published(null)));
        when(sessionManager.createSession(TID)).thenReturn("session-token");

        controller.verifyPassword(ctx);

        verify(sessionManager).createSession(TID);
    }

    // ── getProjection (session gating) ──────────────────────────────────────

    @Test
    void getProjection_passwordProtectedNoSession_returns401() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        when(ctx.cookie("form_session")).thenReturn(null);

        controller.getProjection(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(projRepo, never()).getProjection(anyString());
    }

    @Test
    void getProjection_validSession_stripsSchemaGroupsAndReturnsBody() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        when(ctx.cookie("form_session")).thenReturn("tok");
        when(sessionManager.validateSession("tok")).thenReturn(TID);
        when(projRepo.getProjection(TID))
                .thenReturn(Optional.of("{\"a\":1,\"schemaGroups\":[{\"secret\":true}]}"));

        controller.getProjection(ctx);

        ArgumentCaptor<String> result = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(result.capture());
        assertFalse(
                result.getValue().contains("schemaGroups"),
                "schemaGroups must be stripped from public projection");
        assertTrue(result.getValue().contains("\"a\":1"));
    }

    @Test
    void getProjection_noPasswordForm_servedWithoutSession() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.of(published(null)));
        when(projRepo.getProjection(TID)).thenReturn(Optional.of("{\"a\":1}"));

        controller.getProjection(ctx);

        verify(ctx).result(anyString());
        verify(ctx, never()).status(HttpStatus.UNAUTHORIZED);
    }

    // ── submitResponse (session gating) ─────────────────────────────────────

    @Test
    void submitResponse_passwordProtectedNoSession_returns401BeforePersist() {
        Context ctx = ctx();
        when(templateList.findById(TID)).thenReturn(Optional.of(published(PW_HASH)));
        when(ctx.cookie("form_session")).thenReturn(null);

        controller.submitResponse(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(responseRepo, never()).put(anyString(), anyString(), eq(TID));
    }
}
