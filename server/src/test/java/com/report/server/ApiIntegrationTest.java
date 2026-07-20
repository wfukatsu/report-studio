package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import io.javalin.testtools.JavalinTest;
import io.javalin.testtools.Response;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Integration tests for the Report Design Studio API. Uses Javalin testtools to spin up a real HTTP
 * server per test. ScalarDB-dependent endpoints (projections, schemas) are excluded since they
 * require a full TransactionFactory setup.
 */
class ApiIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TemplateListRepository templateListRepo;

    @BeforeEach
    void setUp() {
        templateListRepo = new TemplateListRepository();
    }

    /**
     * Build a minimal Javalin app with only the non-ScalarDB routes. Mirrors App.java route
     * registration for health, auth, and template CRUD.
     */
    private Javalin createTestApp() {
        return createTestApp(config -> {});
    }

    /**
     * Javalin 7 requires all routes/filters to be registered inside the {@code create()} config
     * block. {@code extra} lets individual tests append additional handlers (e.g. the security
     * after-filter) within the same block.
     */
    private Javalin createTestApp(
            java.util.function.Consumer<io.javalin.config.JavalinConfig> extra) {
        return Javalin.create(
                config -> {
                    // Auth before-filter
                    config.routes.before(
                            "/api/*",
                            ctx ->
                                    ctx.attribute(
                                            "principal",
                                            com.report.server.auth.Principal.ANONYMOUS));

                    // Auth endpoint
                    config.routes.get(
                            "/api/v1/auth/me",
                            ctx -> {
                                var principal =
                                        (com.report.server.auth.Principal)
                                                ctx.attribute("principal");
                                ctx.json(
                                        Map.of(
                                                "userId", principal.userId(),
                                                "displayName", principal.displayName(),
                                                "roles", principal.roles(),
                                                "anonymous", principal.isAnonymous()));
                            });

                    // Health
                    config.routes.get("/api/v1/health", ctx -> ctx.json(Map.of("status", "ok")));

                    // Template list CRUD
                    config.routes.get(
                            "/api/v1/templates", ctx -> ctx.json(templateListRepo.list()));
                    config.routes.post(
                            "/api/v1/templates",
                            ctx -> {
                                String name =
                                        RequestValidator.validateTemplateName(ctx, "新しいテンプレート");
                                if (name == null) return;
                                var meta = templateListRepo.create(name);
                                ctx.status(201);
                                ctx.json(meta);
                            });
                    config.routes.delete(
                            "/api/v1/templates/{id}",
                            ctx -> {
                                String id = RequestValidator.validateId(ctx);
                                if (id == null) return;
                                boolean deleted = templateListRepo.delete(id);
                                ctx.json(Map.of("deleted", deleted));
                            });
                    config.routes.patch(
                            "/api/v1/templates/{id}",
                            ctx -> {
                                String id = RequestValidator.validateId(ctx);
                                if (id == null) return;
                                String name = RequestValidator.validateTemplateName(ctx, null);
                                if (name == null) return;
                                templateListRepo.touch(id, name);
                                ctx.json(Map.of("status", "renamed", "id", id, "name", name));
                            });

                    // ID validation test route (reuses the designer-projection pattern)
                    config.routes.get(
                            "/api/v1/templates/{id}/designer-projection",
                            ctx -> {
                                String id = RequestValidator.validateId(ctx);
                                if (id == null) return;
                                ctx.json(Map.of("id", id));
                            });

                    extra.accept(config);
                });
    }

    // ── Health ────────────────────────────────────────────────────────

    @Nested
    class HealthEndpoint {

        @Test
        void returns200WithStatusOk() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response response = client.get("/api/v1/health");
                        assertEquals(200, response.code());
                        JsonNode body = parseBody(response);
                        assertEquals("ok", body.get("status").asText());
                    });
        }
    }

    // ── Auth ─────────────────────────────────────────────────────────

    @Nested
    class AuthEndpoint {

        @Test
        void returnsAnonymousPrincipal() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response response = client.get("/api/v1/auth/me");
                        assertEquals(200, response.code());
                        JsonNode body = parseBody(response);
                        assertEquals("anonymous", body.get("userId").asText());
                        assertEquals("Anonymous User", body.get("displayName").asText());
                        assertTrue(body.get("anonymous").asBoolean());
                        assertTrue(body.get("roles").isArray());
                        assertEquals(0, body.get("roles").size()); // ANONYMOUS has no roles
                    });
        }
    }

    // ── Template CRUD ────────────────────────────────────────────────

    @Nested
    class TemplateCrud {

        @Test
        void createReturns201WithIdAndName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response response =
                                client.post("/api/v1/templates", Map.of("name", "テスト帳票"));
                        assertEquals(201, response.code());
                        JsonNode body = parseBody(response);
                        assertTrue(body.get("id").asText().startsWith("tmpl-"));
                        assertEquals("テスト帳票", body.get("name").asText());
                        assertTrue(body.get("updatedAt").asLong() > 0);
                    });
        }

        @Test
        void createWithDefaultName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response response = client.post("/api/v1/templates", Map.of());
                        assertEquals(201, response.code());
                        JsonNode body = parseBody(response);
                        assertEquals("新しいテンプレート", body.get("name").asText());
                    });
        }

        @Test
        void listContainsCreatedTemplate() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        // Create a template
                        Response createResp =
                                client.post("/api/v1/templates", Map.of("name", "一覧テスト"));
                        assertEquals(201, createResp.code());

                        // List templates
                        Response listResp = client.get("/api/v1/templates");
                        assertEquals(200, listResp.code());
                        JsonNode body = MAPPER.readTree(listResp.body().string());
                        assertTrue(body.isArray());
                        assertTrue(body.size() > 0);
                        boolean found = false;
                        for (JsonNode node : body) {
                            if ("一覧テスト".equals(node.get("name").asText())) {
                                found = true;
                                break;
                            }
                        }
                        assertTrue(found, "Created template should appear in list");
                    });
        }

        @Test
        void renameUpdatesName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        // Create
                        String id;
                        Response createResp =
                                client.post("/api/v1/templates", Map.of("name", "変更前"));
                        id = parseBody(createResp).get("id").asText();

                        // Rename via PATCH
                        Response patchResp =
                                client.patch("/api/v1/templates/" + id, Map.of("name", "新名前"));
                        assertEquals(200, patchResp.code());
                        JsonNode body = parseBody(patchResp);
                        assertEquals("renamed", body.get("status").asText());
                        assertEquals("新名前", body.get("name").asText());

                        // Verify via GET
                        Response listResp = client.get("/api/v1/templates");
                        JsonNode list = MAPPER.readTree(listResp.body().string());
                        boolean found = false;
                        for (JsonNode node : list) {
                            if (id.equals(node.get("id").asText())) {
                                assertEquals("新名前", node.get("name").asText());
                                found = true;
                                break;
                            }
                        }
                        assertTrue(found, "Renamed template should be in list");
                    });
        }

        @Test
        void deleteRemovesTemplate() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        // Create
                        String id;
                        Response createResp =
                                client.post("/api/v1/templates", Map.of("name", "削除対象"));
                        id = parseBody(createResp).get("id").asText();

                        // Delete
                        Response deleteResp = client.delete("/api/v1/templates/" + id);
                        assertEquals(200, deleteResp.code());
                        JsonNode body = parseBody(deleteResp);
                        assertTrue(body.get("deleted").asBoolean());

                        // Verify removed
                        Response listResp = client.get("/api/v1/templates");
                        JsonNode list = MAPPER.readTree(listResp.body().string());
                        for (JsonNode node : list) {
                            assertNotEquals(id, node.get("id").asText());
                        }
                    });
        }

        @Test
        void deleteNonExistentReturnsFalse() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response resp = client.delete("/api/v1/templates/non-existent-id");
                        assertEquals(200, resp.code());
                        JsonNode body = parseBody(resp);
                        assertFalse(body.get("deleted").asBoolean());
                    });
        }
    }

    // ── ID Validation ────────────────────────────────────────────────

    @Nested
    class IdValidation {

        @Test
        void rejectsPathTraversal() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response resp =
                                client.get(
                                        "/api/v1/templates/..%2F..%2Fetc%2Fpasswd/designer-projection");
                        assertEquals(400, resp.code());
                        JsonNode body = parseBody(resp);
                        assertEquals("Invalid id format", body.get("error").asText());
                    });
        }

        @Test
        void rejectsSpecialCharacters() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response resp =
                                client.get(
                                        "/api/v1/templates/id%3BDROP%20TABLE/designer-projection");
                        assertEquals(400, resp.code());
                        JsonNode body = parseBody(resp);
                        assertEquals("Invalid id format", body.get("error").asText());
                    });
        }

        @Test
        void acceptsValidId() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        Response resp =
                                client.get("/api/v1/templates/tmpl-abc123_XYZ/designer-projection");
                        assertEquals(200, resp.code());
                        JsonNode body = parseBody(resp);
                        assertEquals("tmpl-abc123_XYZ", body.get("id").asText());
                    });
        }
    }

    // ── Template Name Validation ─────────────────────────────────────

    @Nested
    class TemplateNameValidation {

        @Test
        void rejectsNameTooLong() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        String longName = "x".repeat(201);
                        Response resp = client.post("/api/v1/templates", Map.of("name", longName));
                        assertEquals(400, resp.code());
                        JsonNode body = parseBody(resp);
                        assertTrue(body.get("error").asText().contains("too long"));
                    });
        }

        @Test
        void acceptsMaxLengthName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        String maxName = "あ".repeat(200);
                        Response resp = client.post("/api/v1/templates", Map.of("name", maxName));
                        assertEquals(201, resp.code());
                        JsonNode body = parseBody(resp);
                        assertEquals(maxName, body.get("name").asText());
                    });
        }
    }

    // ── Security Headers ─────────────────────────────────────────────

    @Nested
    class SecurityHeaders {

        @Test
        void responsesIncludeSecurityHeaders() {
            // Add the same after-filter as App.java (Javalin 7: inside the config block)
            Javalin app =
                    createTestApp(
                            config ->
                                    config.routes.after(
                                            ctx -> {
                                                ctx.header("X-Content-Type-Options", "nosniff");
                                                ctx.header("X-Frame-Options", "DENY");
                                                ctx.header("Referrer-Policy", "no-referrer");
                                            }));

            JavalinTest.test(
                    app,
                    (server, client) -> {
                        Response resp = client.get("/api/v1/health");
                        assertEquals(200, resp.code());
                        assertEquals(
                                "nosniff", resp.headers().get("X-Content-Type-Options").get(0));
                        assertEquals("DENY", resp.headers().get("X-Frame-Options").get(0));
                        assertEquals("no-referrer", resp.headers().get("Referrer-Policy").get(0));
                    });
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private static JsonNode parseBody(Response response) throws Exception {
        assertNotNull(response.body(), "Response body should not be null");
        return MAPPER.readTree(response.body().string());
    }
}
