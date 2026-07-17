package com.report.server;

import com.report.server.auth.Principal;
import io.javalin.Javalin;
import io.javalin.testtools.JavalinTest;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies that {@link ApiRoutes#registerAdminRoleFilter} actually wires the
 * admin-role before-filter onto the /api/v1/admin/* path pattern, over real
 * HTTP. AdminUserController and AdminServerController perform no role check
 * of their own — this filter is the only thing standing between an
 * authenticated non-admin user and admin endpoints, so the wiring itself
 * (not just the {@link ApiRoutes#requireAdminRole} predicate) must be pinned
 * by a test.
 */
class AdminRoleFilterWiringTest {

    private static final Principal ADMIN =
            new Principal("admin1", "管理者", Set.of("admin", "user"));
    private static final Principal NON_ADMIN =
            new Principal("user1", "一般ユーザー", Set.of("user"));

    /**
     * Builds an app that mirrors the production filter order: a principal
     * -resolving before-filter first (stubbed), then the real admin filter
     * registration under test, then representative routes.
     */
    private Javalin createApp(Principal principal) {
        Javalin app = Javalin.create();
        app.before("/api/*", ctx -> ctx.attribute("principal", principal));
        ApiRoutes.registerAdminRoleFilter(app);
        app.get("/api/v1/admin/ping", ctx -> ctx.result("pong"));
        app.get("/api/v1/templates", ctx -> ctx.result("ok"));
        return app;
    }

    @Test
    void adminPathRejectsNonAdminWith403() {
        JavalinTest.test(createApp(NON_ADMIN), (server, client) -> {
            var res = client.get("/api/v1/admin/ping");
            assertEquals(403, res.code());
        });
    }

    @Test
    void adminPathRejectsAnonymousWith403() {
        JavalinTest.test(createApp(Principal.ANONYMOUS), (server, client) -> {
            var res = client.get("/api/v1/admin/ping");
            assertEquals(403, res.code());
        });
    }

    @Test
    void adminPathAllowsAdmin() {
        JavalinTest.test(createApp(ADMIN), (server, client) -> {
            var res = client.get("/api/v1/admin/ping");
            assertEquals(200, res.code());
            assertEquals("pong", res.body().string());
        });
    }

    @Test
    void nonAdminPathIsNotAffectedByFilter() {
        JavalinTest.test(createApp(NON_ADMIN), (server, client) -> {
            var res = client.get("/api/v1/templates");
            assertEquals(200, res.code());
        });
    }
}
