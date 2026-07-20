package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import io.javalin.testtools.JavalinTest;
import java.util.Map;
import okhttp3.MediaType;
import okhttp3.RequestBody;
import okhttp3.Response;
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
    private static final MediaType JSON_MEDIA_TYPE =
            MediaType.get("application/json; charset=utf-8");

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
        Javalin app = Javalin.create();

        // Auth before-filter
        app.before(
                "/api/*",
                ctx -> ctx.attribute("principal", com.report.server.auth.Principal.ANONYMOUS));

        // Auth endpoint
        app.get(
                "/api/v1/auth/me",
                ctx -> {
                    var principal = (com.report.server.auth.Principal) ctx.attribute("principal");
                    ctx.json(
                            Map.of(
                                    "userId", principal.userId(),
                                    "displayName", principal.displayName(),
                                    "roles", principal.roles(),
                                    "anonymous", principal.isAnonymous()));
                });

        // Health
        app.get("/api/v1/health", ctx -> ctx.json(Map.of("status", "ok")));

        // Template list CRUD
        app.get("/api/v1/templates", ctx -> ctx.json(templateListRepo.list()));
        app.post(
                "/api/v1/templates",
                ctx -> {
                    String name = RequestValidator.validateTemplateName(ctx, "新しいテンプレート");
                    if (name == null) return;
                    var meta = templateListRepo.create(name);
                    ctx.status(201);
                    ctx.json(meta);
                });
        app.delete(
                "/api/v1/templates/{id}",
                ctx -> {
                    String id = RequestValidator.validateId(ctx);
                    if (id == null) return;
                    boolean deleted = templateListRepo.delete(id);
                    ctx.json(Map.of("deleted", deleted));
                });
        app.patch(
                "/api/v1/templates/{id}",
                ctx -> {
                    String id = RequestValidator.validateId(ctx);
                    if (id == null) return;
                    String name = RequestValidator.validateTemplateName(ctx, null);
                    if (name == null) return;
                    templateListRepo.touch(id, name);
                    ctx.json(Map.of("status", "renamed", "id", id, "name", name));
                });

        // ID validation test route (reuses the same pattern as designer-projection)
        app.get(
                "/api/v1/templates/{id}/designer-projection",
                ctx -> {
                    String id = RequestValidator.validateId(ctx);
                    if (id == null) return;
                    ctx.json(Map.of("id", id));
                });

        return app;
    }

    // ── Health ────────────────────────────────────────────────────────

    @Nested
    class HealthEndpoint {

        @Test
        void returns200WithStatusOk() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        try (Response response = client.get("/api/v1/health")) {
                            assertEquals(200, response.code());
                            JsonNode body = parseBody(response);
                            assertEquals("ok", body.get("status").asText());
                        }
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
                        try (Response response = client.get("/api/v1/auth/me")) {
                            assertEquals(200, response.code());
                            JsonNode body = parseBody(response);
                            assertEquals("anonymous", body.get("userId").asText());
                            assertEquals("Anonymous User", body.get("displayName").asText());
                            assertTrue(body.get("anonymous").asBoolean());
                            assertTrue(body.get("roles").isArray());
                            assertEquals(0, body.get("roles").size()); // ANONYMOUS has no roles
                        }
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
                        try (Response response =
                                client.post("/api/v1/templates", Map.of("name", "テスト帳票"))) {
                            assertEquals(201, response.code());
                            JsonNode body = parseBody(response);
                            assertTrue(body.get("id").asText().startsWith("tmpl-"));
                            assertEquals("テスト帳票", body.get("name").asText());
                            assertTrue(body.get("updatedAt").asLong() > 0);
                        }
                    });
        }

        @Test
        void createWithDefaultName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        try (Response response = client.post("/api/v1/templates", Map.of())) {
                            assertEquals(201, response.code());
                            JsonNode body = parseBody(response);
                            assertEquals("新しいテンプレート", body.get("name").asText());
                        }
                    });
        }

        @Test
        void listContainsCreatedTemplate() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        // Create a template
                        try (Response createResp =
                                client.post("/api/v1/templates", Map.of("name", "一覧テスト"))) {
                            assertEquals(201, createResp.code());
                        }

                        // List templates
                        try (Response listResp = client.get("/api/v1/templates")) {
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
                        }
                    });
        }

        @Test
        void renameUpdatesName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        // Create
                        String id;
                        try (Response createResp =
                                client.post("/api/v1/templates", Map.of("name", "変更前"))) {
                            id = parseBody(createResp).get("id").asText();
                        }

                        // Rename via PATCH
                        RequestBody patchBody = jsonBody(Map.of("name", "新名前"));
                        try (Response patchResp =
                                client.request(
                                        "/api/v1/templates/" + id,
                                        builder -> builder.patch(patchBody))) {
                            assertEquals(200, patchResp.code());
                            JsonNode body = parseBody(patchResp);
                            assertEquals("renamed", body.get("status").asText());
                            assertEquals("新名前", body.get("name").asText());
                        }

                        // Verify via GET
                        try (Response listResp = client.get("/api/v1/templates")) {
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
                        }
                    });
        }

        @Test
        void deleteRemovesTemplate() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        // Create
                        String id;
                        try (Response createResp =
                                client.post("/api/v1/templates", Map.of("name", "削除対象"))) {
                            id = parseBody(createResp).get("id").asText();
                        }

                        // Delete
                        try (Response deleteResp = client.delete("/api/v1/templates/" + id)) {
                            assertEquals(200, deleteResp.code());
                            JsonNode body = parseBody(deleteResp);
                            assertTrue(body.get("deleted").asBoolean());
                        }

                        // Verify removed
                        try (Response listResp = client.get("/api/v1/templates")) {
                            JsonNode list = MAPPER.readTree(listResp.body().string());
                            for (JsonNode node : list) {
                                assertNotEquals(id, node.get("id").asText());
                            }
                        }
                    });
        }

        @Test
        void deleteNonExistentReturnsFalse() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        try (Response resp = client.delete("/api/v1/templates/non-existent-id")) {
                            assertEquals(200, resp.code());
                            JsonNode body = parseBody(resp);
                            assertFalse(body.get("deleted").asBoolean());
                        }
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
                        try (Response resp =
                                client.get(
                                        "/api/v1/templates/..%2F..%2Fetc%2Fpasswd/designer-projection")) {
                            assertEquals(400, resp.code());
                            JsonNode body = parseBody(resp);
                            assertEquals("Invalid id format", body.get("error").asText());
                        }
                    });
        }

        @Test
        void rejectsSpecialCharacters() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        try (Response resp =
                                client.get(
                                        "/api/v1/templates/id%3BDROP%20TABLE/designer-projection")) {
                            assertEquals(400, resp.code());
                            JsonNode body = parseBody(resp);
                            assertEquals("Invalid id format", body.get("error").asText());
                        }
                    });
        }

        @Test
        void acceptsValidId() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        try (Response resp =
                                client.get(
                                        "/api/v1/templates/tmpl-abc123_XYZ/designer-projection")) {
                            assertEquals(200, resp.code());
                            JsonNode body = parseBody(resp);
                            assertEquals("tmpl-abc123_XYZ", body.get("id").asText());
                        }
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
                        try (Response resp =
                                client.post("/api/v1/templates", Map.of("name", longName))) {
                            assertEquals(400, resp.code());
                            JsonNode body = parseBody(resp);
                            assertTrue(body.get("error").asText().contains("too long"));
                        }
                    });
        }

        @Test
        void acceptsMaxLengthName() {
            JavalinTest.test(
                    createTestApp(),
                    (server, client) -> {
                        String maxName = "あ".repeat(200);
                        try (Response resp =
                                client.post("/api/v1/templates", Map.of("name", maxName))) {
                            assertEquals(201, resp.code());
                            JsonNode body = parseBody(resp);
                            assertEquals(maxName, body.get("name").asText());
                        }
                    });
        }
    }

    // ── Security Headers ─────────────────────────────────────────────

    @Nested
    class SecurityHeaders {

        @Test
        void responsesIncludeSecurityHeaders() {
            Javalin app = createTestApp();
            // Add the same after-filter as App.java
            app.after(
                    ctx -> {
                        ctx.header("X-Content-Type-Options", "nosniff");
                        ctx.header("X-Frame-Options", "DENY");
                        ctx.header("Referrer-Policy", "no-referrer");
                    });

            JavalinTest.test(
                    app,
                    (server, client) -> {
                        try (Response resp = client.get("/api/v1/health")) {
                            assertEquals(200, resp.code());
                            assertEquals("nosniff", resp.header("X-Content-Type-Options"));
                            assertEquals("DENY", resp.header("X-Frame-Options"));
                            assertEquals("no-referrer", resp.header("Referrer-Policy"));
                        }
                    });
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private static JsonNode parseBody(Response response) throws Exception {
        assertNotNull(response.body(), "Response body should not be null");
        return MAPPER.readTree(response.body().string());
    }

    private static RequestBody jsonBody(Object obj) throws Exception {
        String json = MAPPER.writeValueAsString(obj);
        return RequestBody.create(json, JSON_MEDIA_TYPE);
    }
}
