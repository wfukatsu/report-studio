package com.report.server;

import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ScalarDbScanController} — focused on the auth/rate-limit
 * gate and the protected-namespace guard (issue #197: the read side must reject
 * system namespaces the same way the write side does, so the raw table browser
 * can never expose {@code report_studio.users} password hashes, API-token hashes,
 * webhook secrets or form-response PII).
 */
class ScalarDbScanControllerTest {

    private static final Principal USER = new Principal("user1", "User One", Set.of("user"));

    private TransactionFactory factory;
    private DistributedTransactionManager txManager;
    private RateLimiter rateLimiter;
    private ScalarDbScanController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        factory = mock(TransactionFactory.class);
        txManager = mock(DistributedTransactionManager.class);
        rateLimiter = mock(RateLimiter.class);

        when(factory.getTransactionManager()).thenReturn(txManager);
        when(rateLimiter.isAllowed(anyString())).thenReturn(true);

        controller = new ScalarDbScanController(factory, rateLimiter);

        ctx = mock(Context.class);
        when(ctx.status(anyInt())).thenReturn(ctx);
        when(ctx.status(org.mockito.ArgumentMatchers.any(HttpStatus.class))).thenReturn(ctx);
        when(ctx.attribute("principal")).thenReturn(USER);
        when(ctx.pathParam("ns")).thenReturn("app");
        when(ctx.pathParam("table")).thenReturn("items");
    }

    // ── Protected-namespace guard (issue #197) ───────────────────────────────

    @Test
    void scan_reportStudioNamespace_403_neverTouchesDb() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("report_studio");
        when(ctx.pathParam("table")).thenReturn("users");

        controller.scanRows(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
        verify(factory, never()).getTransactionAdmin();
        verify(txManager, never()).start();
    }

    @Test
    void scan_scalardbNamespace_403() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("scalardb");
        when(ctx.pathParam("table")).thenReturn("metadata");

        controller.scanRows(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
        verify(txManager, never()).start();
    }

    @Test
    void scan_coordinatorNamespace_403() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("coordinator");
        when(ctx.pathParam("table")).thenReturn("state");

        controller.scanRows(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
        verify(txManager, never()).start();
    }

    // ── Auth / rate-limit gating ─────────────────────────────────────────────

    @Test
    void scan_noPrincipal_401() throws Exception {
        when(ctx.attribute("principal")).thenReturn(null);

        controller.scanRows(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(txManager, never()).start();
    }

    @Test
    void scan_anonymousPrincipal_401() throws Exception {
        when(ctx.attribute("principal")).thenReturn(Principal.ANONYMOUS);

        controller.scanRows(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void scan_rateLimited_429() throws Exception {
        when(rateLimiter.isAllowed("user1")).thenReturn(false);

        controller.scanRows(ctx);

        verify(ctx).status(429);
        verify(txManager, never()).start();
    }

    @Test
    void scan_invalidNamespaceIdentifier_400() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("bad-ns;drop");

        controller.scanRows(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(txManager, never()).start();
    }
}
