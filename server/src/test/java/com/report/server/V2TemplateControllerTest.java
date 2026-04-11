package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class V2TemplateControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository repo;
    private V2TemplateController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        repo = mock(JsonBlobRepository.class);
        controller = new V2TemplateController(repo);
        ctx = mock(Context.class);
    }

    // ── list ──────────────────────────────────────────────────────────────────

    @Test
    void list_returnsItemsAndTotal() throws Exception {
        String envelope = MAPPER.writeValueAsString(MAPPER.createObjectNode()
            .put("id", "t1")
            .put("name", "テスト")
            .put("created_at", 1000L)
            .put("updated_at", 2000L));
        when(repo.list()).thenReturn(List.of(envelope));

        controller.list(ctx);

        verify(ctx).contentType("application/json");
        // Capture result string
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(1, resp.path("total").asInt());
        JsonNode item = resp.path("items").get(0);
        assertEquals("t1", item.path("id").asText());
        assertEquals("テスト", item.path("name").asText());
        assertNotNull(item.path("createdAt").asText());
        assertNotNull(item.path("updatedAt").asText());
    }

    @Test
    void list_returnsEmptyWhenNoTemplates() throws Exception {
        when(repo.list()).thenReturn(List.of());

        controller.list(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(0, resp.path("total").asInt());
        assertTrue(resp.path("items").isEmpty());
    }

    @Test
    void list_skipsMalformedEntries() throws Exception {
        when(repo.list()).thenReturn(List.of("not-json", "{\"id\":\"\"}"));

        controller.list(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(0, resp.path("total").asInt());
    }

    @Test
    void list_filtersOutOtherUsersTemplates() throws Exception {
        String mine = MAPPER.writeValueAsString(MAPPER.createObjectNode()
                .put("id", "t1").put("name", "自分の").put("created_by", "me"));
        String others = MAPPER.writeValueAsString(MAPPER.createObjectNode()
                .put("id", "t2").put("name", "他人の").put("created_by", "other-user"));
        String legacy = MAPPER.writeValueAsString(MAPPER.createObjectNode()
                .put("id", "t3").put("name", "レガシー"));
        when(repo.list()).thenReturn(List.of(mine, others, legacy));
        var principal = mock(com.report.server.auth.Principal.class);
        when(principal.userId()).thenReturn("me");
        when(ctx.attribute("principal")).thenReturn(principal);

        controller.list(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        // only "t1" (own) and "t3" (legacy) — "t2" filtered out
        assertEquals(2, resp.path("total").asInt());
        var ids = new java.util.HashSet<String>();
        resp.path("items").forEach(item -> ids.add(item.path("id").asText()));
        assertTrue(ids.contains("t1"));
        assertFalse(ids.contains("t2"));
        assertTrue(ids.contains("t3"));
    }

    @Test
    void isOwner_returnsFalseOnMalformedEnvelope() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        // Malformed JSON — should return false (fail closed), causing 404
        when(repo.get("t1")).thenReturn(Optional.of("not-valid-json"));
        var principal = mock(com.report.server.auth.Principal.class);
        when(principal.userId()).thenReturn("any-user");
        when(ctx.attribute("principal")).thenReturn(principal);

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void create_storesEnvelopeAndReturns201() throws Exception {
        when(ctx.body()).thenReturn("{\"name\":\"マイレポート\"}");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.CREATED);
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertNotNull(resp.path("id").asText());
        assertEquals("マイレポート", resp.path("name").asText());
        assertFalse(resp.path("createdAt").asText("").isBlank());

        // Verify repo was called with envelope containing definition
        verify(repo).put(anyString(), argThat(json -> {
            try {
                JsonNode env = MAPPER.readTree(json);
                return env.has("definition") && "マイレポート".equals(env.path("name").asText());
            } catch (Exception e) { return false; }
        }));
    }

    @Test
    void create_usesDefaultNameWhenBodyEmpty() throws Exception {
        when(ctx.body()).thenReturn("");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.CREATED);
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals("新しいテンプレート", resp.path("name").asText());
    }

    @Test
    void create_rejectsNameTooLong() throws Exception {
        String longName = "a".repeat(201);
        when(ctx.body()).thenReturn("{\"name\":\"" + longName + "\"}");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(anyString(), anyString());
    }

    @Test
    void create_rejectsInvalidJson() throws Exception {
        when(ctx.body()).thenReturn("not-json");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(anyString(), anyString());
    }

    // ── get ───────────────────────────────────────────────────────────────────

    @Test
    void get_returnsDefinitionWhenFound() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        String envelope = buildEnvelope("t1", "テスト");
        when(repo.get("t1")).thenReturn(Optional.of(envelope));

        controller.get(ctx);

        verify(ctx).contentType("application/json");
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode def = MAPPER.readTree(captor.getValue());
        assertEquals("t1", def.path("id").asText());
    }

    @Test
    void get_returns404WhenNotFound() throws Exception {
        when(ctx.pathParam("id")).thenReturn("missing");
        when(repo.get("missing")).thenReturn(Optional.empty());

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void get_returns400ForInvalidId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("../etc/passwd");

        controller.get(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).get(anyString());
    }

    @Test
    void get_returns404ForNonOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        String envelope = MAPPER.createObjectNode()
                .put("id", "t1")
                .put("created_by", "owner-user")
                .set("definition", MAPPER.createObjectNode().put("id", "t1")).toString();
        when(repo.get("t1")).thenReturn(Optional.of(envelope));
        var principal = mock(com.report.server.auth.Principal.class);
        when(principal.userId()).thenReturn("other-user");
        when(ctx.attribute("principal")).thenReturn(principal);

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(ctx, never()).result(anyString());
    }

    @Test
    void get_allowsOwnerAccess() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        String envelope = MAPPER.createObjectNode()
                .put("id", "t1")
                .put("created_by", "owner-user")
                .set("definition", MAPPER.createObjectNode().put("id", "t1")).toString();
        when(repo.get("t1")).thenReturn(Optional.of(envelope));
        var principal = mock(com.report.server.auth.Principal.class);
        when(principal.userId()).thenReturn("owner-user");
        when(ctx.attribute("principal")).thenReturn(principal);

        controller.get(ctx);

        verify(ctx).contentType("application/json");
        verify(ctx).result(anyString());
    }

    // ── put ───────────────────────────────────────────────────────────────────

    @Test
    void put_updatesEnvelopeAndReturnsDefinition() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        String oldEnvelope = buildEnvelope("t1", "旧名称");
        when(repo.get("t1")).thenReturn(Optional.of(oldEnvelope));

        String defJson = MAPPER.createObjectNode()
            .put("id", "t1")
            .set("metadata", MAPPER.createObjectNode().put("documentName", "新名称")).toString();
        when(ctx.body()).thenReturn(defJson);

        controller.put(ctx);

        verify(ctx).contentType("application/json");
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode result = MAPPER.readTree(captor.getValue());
        assertEquals("t1", result.path("id").asText());

        verify(repo).put(eq("t1"), argThat(json -> {
            try {
                JsonNode env = MAPPER.readTree(json);
                return "新名称".equals(env.path("name").asText());
            } catch (Exception e) { return false; }
        }));
    }

    @Test
    void put_rejectsEmptyBody() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        when(ctx.body()).thenReturn("");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(anyString(), anyString());
    }

    @Test
    void put_returns404ForNonOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        String oldEnvelope = MAPPER.createObjectNode()
                .put("id", "t1")
                .put("created_by", "owner-user")
                .set("definition", MAPPER.createObjectNode()).toString();
        when(repo.get("t1")).thenReturn(Optional.of(oldEnvelope));
        var principal = mock(com.report.server.auth.Principal.class);
        when(principal.userId()).thenReturn("other-user");
        when(ctx.attribute("principal")).thenReturn(principal);
        when(ctx.body()).thenReturn("{\"id\":\"t1\"}");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(repo, never()).put(anyString(), anyString());
    }

    @Test
    void put_preservesCreatedAt() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        long originalCreatedAt = 999_000L;
        String oldEnvelope = MAPPER.createObjectNode()
            .put("id", "t1")
            .put("name", "x")
            .put("created_at", originalCreatedAt)
            .put("updated_at", 999_001L)
            .set("definition", MAPPER.createObjectNode()).toString();
        when(repo.get("t1")).thenReturn(Optional.of(oldEnvelope));

        String defJson = MAPPER.createObjectNode()
            .put("id", "t1")
            .set("metadata", MAPPER.createObjectNode().put("documentName", "y")).toString();
        when(ctx.body()).thenReturn(defJson);

        controller.put(ctx);

        verify(repo).put(eq("t1"), argThat(json -> {
            try {
                JsonNode env = MAPPER.readTree(json);
                return env.path("created_at").asLong() == originalCreatedAt;
            } catch (Exception e) { return false; }
        }));
    }

    // ── delete ────────────────────────────────────────────────────────────────

    @Test
    void delete_callsRepoDeleteAndReturns204() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        // Legacy template without created_by — ownership check passes for any caller
        String envelope = MAPPER.writeValueAsString(MAPPER.createObjectNode()
                .put("id", "t1")
                .put("name", "テスト")
                .set("definition", MAPPER.createObjectNode()));
        when(repo.get("t1")).thenReturn(Optional.of(envelope));

        controller.delete(ctx);

        verify(repo).delete("t1");
        verify(ctx).status(HttpStatus.NO_CONTENT);
    }

    @Test
    void delete_returns404ForNonOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("t1");
        String envelope = MAPPER.writeValueAsString(MAPPER.createObjectNode()
                .put("id", "t1")
                .put("created_by", "owner-user")
                .set("definition", MAPPER.createObjectNode()));
        when(repo.get("t1")).thenReturn(Optional.of(envelope));
        var principal = mock(com.report.server.auth.Principal.class);
        when(principal.userId()).thenReturn("other-user");
        when(ctx.attribute("principal")).thenReturn(principal);

        controller.delete(ctx);

        verify(repo, never()).delete(anyString());
        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void delete_returns400ForInvalidId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("bad id!");

        controller.delete(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).delete(anyString());
    }

    // ── buildDefaultDefinition ────────────────────────────────────────────────

    @Test
    void buildDefaultDefinition_hasRequiredFields() {
        var def = V2TemplateController.buildDefaultDefinition("id-1", "テスト");
        assertEquals("id-1", def.path("id").asText());
        assertEquals("テスト", def.path("metadata").path("documentName").asText());
        assertTrue(def.has("pages"));
        assertTrue(def.has("calculationRules"));
        assertTrue(def.has("validationRules"));
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private String buildEnvelope(String id, String name) throws Exception {
        return MAPPER.createObjectNode()
            .put("id", id)
            .put("name", name)
            .put("created_at", System.currentTimeMillis())
            .put("updated_at", System.currentTimeMillis())
            .set("definition", MAPPER.createObjectNode().put("id", id)).toString();
    }
}
