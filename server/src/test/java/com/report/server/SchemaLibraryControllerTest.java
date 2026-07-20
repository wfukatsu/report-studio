package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link SchemaLibraryController} — schema CRUD under /api/v2/schemas (list / create
 * / get / update / delete) including error paths (404 unknown id, invalid body) and the
 * private-vs-shared visibility rules.
 */
class SchemaLibraryControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository repo;
    private SchemaLibraryController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        repo = mock(JsonBlobRepository.class);
        controller = new SchemaLibraryController(repo);
        ctx = mock(Context.class);
        when(ctx.attribute("principal"))
                .thenReturn(new Principal("user-1", "Test User", java.util.Set.of("user")));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private String envelope(String id, String name, String createdBy, String visibility)
            throws Exception {
        ObjectNode env = MAPPER.createObjectNode();
        env.put("id", id);
        env.put("name", name);
        env.put("created_at", 1000L);
        env.put("updated_at", 2000L);
        env.put("created_by", createdBy);
        env.put("visibility", visibility);
        ObjectNode def = env.putObject("definition");
        def.putArray("groups");
        return MAPPER.writeValueAsString(env);
    }

    /** Captures the JSON string passed to ctx.result(String). */
    private JsonNode capturedResult() throws Exception {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        return MAPPER.readTree(captor.getValue());
    }

    // ── list ─────────────────────────────────────────────────────────────────

    @Test
    void list_returnsOwnAndSharedSchemas() throws Exception {
        when(repo.listByGroupKey("user-1"))
                .thenReturn(List.of(envelope("sch-1", "自分の", "user-1", "private")));
        when(repo.list())
                .thenReturn(
                        List.of(
                                envelope("sch-1", "自分の", "user-1", "private"),
                                envelope("sch-2", "共有", "other-user", "shared"),
                                envelope("sch-3", "他人の非公開", "other-user", "private")));

        controller.list(ctx);

        JsonNode body = capturedResult();
        assertEquals(2, body.get("total").asInt());
        var ids = new java.util.HashSet<String>();
        body.get("items").forEach(item -> ids.add(item.get("id").asText()));
        assertTrue(ids.contains("sch-1"));
        assertTrue(ids.contains("sch-2"));
        assertFalse(ids.contains("sch-3"), "other users' private schemas must be hidden");
    }

    @Test
    void list_deduplicatesOwnSharedSchema() throws Exception {
        String ownShared = envelope("sch-1", "自分の共有", "user-1", "shared");
        when(repo.listByGroupKey("user-1")).thenReturn(List.of(ownShared));
        when(repo.list()).thenReturn(List.of(ownShared));

        controller.list(ctx);

        assertEquals(1, capturedResult().get("total").asInt());
    }

    @Test
    void list_skipsMalformedEntries() throws Exception {
        when(repo.listByGroupKey("user-1")).thenReturn(List.of("not json at all"));
        when(repo.list()).thenReturn(List.of("{broken", envelope("s2", "OK", "x", "shared")));

        controller.list(ctx);

        assertEquals(1, capturedResult().get("total").asInt());
    }

    // ── create ───────────────────────────────────────────────────────────────

    @Test
    void create_returns201AndPersistsEnvelope() throws Exception {
        when(ctx.body()).thenReturn("{\"name\":\"請求書スキーマ\",\"definition\":{\"groups\":[]}}");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.CREATED);
        ArgumentCaptor<String> blobCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo).put(anyString(), blobCaptor.capture(), eq("user-1"));
        JsonNode stored = MAPPER.readTree(blobCaptor.getValue());
        assertEquals("請求書スキーマ", stored.get("name").asText());
        assertEquals("user-1", stored.get("created_by").asText());
        assertEquals("private", stored.get("visibility").asText());
        assertTrue(stored.has("definition"));
    }

    @Test
    void create_defaultsNameAndNormalizesVisibility() throws Exception {
        when(ctx.body()).thenReturn("{\"visibility\":\"internal\",\"definition\":{}}");

        controller.create(ctx);

        ArgumentCaptor<String> blobCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo).put(anyString(), blobCaptor.capture(), eq("user-1"));
        JsonNode stored = MAPPER.readTree(blobCaptor.getValue());
        assertEquals("新しいスキーマ", stored.get("name").asText());
        assertEquals("private", stored.get("visibility").asText(), "unknown visibility → private");
    }

    @Test
    void create_rejectsEmptyBody() throws Exception {
        when(ctx.body()).thenReturn("");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(anyString(), anyString(), anyString());
    }

    @Test
    void create_rejectsInvalidJson() throws Exception {
        when(ctx.body()).thenReturn("{not-json");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(anyString(), anyString(), anyString());
    }

    @Test
    void create_rejectsMissingDefinition() throws Exception {
        when(ctx.body()).thenReturn("{\"name\":\"定義なし\"}");

        controller.create(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(anyString(), anyString(), anyString());
    }

    // ── get ──────────────────────────────────────────────────────────────────

    @Test
    void get_returnsFullEnvelopeForOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(repo.get("sch-1"))
                .thenReturn(Optional.of(envelope("sch-1", "マイスキーマ", "user-1", "private")));

        controller.get(ctx);

        JsonNode body = capturedResult();
        assertEquals("sch-1", body.get("id").asText());
        assertEquals("マイスキーマ", body.get("name").asText());
        assertEquals("private", body.get("visibility").asText());
        assertTrue(body.has("definition"));
    }

    @Test
    void get_returns404ForUnknownId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-missing");
        when(repo.get("sch-missing")).thenReturn(Optional.empty());

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void get_returns404ForOtherUsersPrivateSchema() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(repo.get("sch-1"))
                .thenReturn(Optional.of(envelope("sch-1", "非公開", "other-user", "private")));

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void get_allowsSharedSchemaOfOtherUser() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-2");
        when(repo.get("sch-2"))
                .thenReturn(Optional.of(envelope("sch-2", "共有", "other-user", "shared")));

        controller.get(ctx);

        assertEquals("sch-2", capturedResult().get("id").asText());
    }

    @Test
    void get_rejectsInvalidIdFormat() throws Exception {
        when(ctx.pathParam("id")).thenReturn("../etc/passwd");

        controller.get(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).get(anyString());
    }

    // ── put ──────────────────────────────────────────────────────────────────

    /** Wires the transactional read path to return the given stored envelope. */
    private com.scalar.db.api.DistributedTransaction stubTx(String storedEnvelope)
            throws Exception {
        var mgr = mock(com.scalar.db.api.DistributedTransactionManager.class);
        var tx = mock(com.scalar.db.api.DistributedTransaction.class);
        when(repo.getTransactionManager()).thenReturn(mgr);
        when(mgr.start()).thenReturn(tx);
        when(repo.getWithinTx(eq(tx), anyString())).thenReturn(Optional.ofNullable(storedEnvelope));
        return tx;
    }

    @Test
    void put_updatesEnvelopeAndCommits() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(ctx.body()).thenReturn("{\"name\":\"改名後\",\"definition\":{\"groups\":[]}}");
        var tx = stubTx(envelope("sch-1", "改名前", "user-1", "private"));

        controller.put(ctx);

        ArgumentCaptor<String> blobCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo).putWithinTx(eq(tx), eq("sch-1"), blobCaptor.capture());
        verify(tx).commit();
        JsonNode stored = MAPPER.readTree(blobCaptor.getValue());
        assertEquals("改名後", stored.get("name").asText());
        assertEquals(1000L, stored.get("created_at").asLong(), "created_at must be preserved");
        assertEquals("user-1", stored.get("created_by").asText(), "created_by must be preserved");
    }

    @Test
    void put_returns404ForUnknownId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-missing");
        when(ctx.body()).thenReturn("{\"name\":\"x\"}");
        var tx = stubTx(null);

        controller.put(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(tx).abort();
        verify(repo, never()).putWithinTx(any(), anyString(), anyString());
    }

    @Test
    void put_returns404WhenNotOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(ctx.body()).thenReturn("{\"name\":\"乗っ取り\"}");
        var tx = stubTx(envelope("sch-1", "他人の", "other-user", "shared"));

        controller.put(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(tx).abort();
        verify(repo, never()).putWithinTx(any(), anyString(), anyString());
    }

    @Test
    void put_returns409OnOptimisticLockMismatch() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        // stored updated_at is 2000, client claims 1500 → conflict
        when(ctx.body()).thenReturn("{\"name\":\"stale\",\"updatedAt\":1500}");
        var tx = stubTx(envelope("sch-1", "現行", "user-1", "private"));

        controller.put(ctx);

        verify(ctx).status(HttpStatus.CONFLICT);
        verify(tx).abort();
        verify(repo, never()).putWithinTx(any(), anyString(), anyString());
    }

    @Test
    void put_rejectsInvalidJsonBody() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(ctx.body()).thenReturn("{broken");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).getTransactionManager();
    }

    // ── delete ───────────────────────────────────────────────────────────────

    @Test
    void delete_removesOwnSchemaWith204() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(repo.get("sch-1"))
                .thenReturn(Optional.of(envelope("sch-1", "削除対象", "user-1", "private")));

        controller.delete(ctx);

        verify(repo).delete("sch-1");
        verify(ctx).status(HttpStatus.NO_CONTENT);
    }

    @Test
    void delete_returns404WhenNotOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-1");
        when(repo.get("sch-1"))
                .thenReturn(Optional.of(envelope("sch-1", "他人の", "other-user", "shared")));

        controller.delete(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(repo, never()).delete(anyString());
    }

    @Test
    void delete_isIdempotentForUnknownId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("sch-gone");
        when(repo.get("sch-gone")).thenReturn(Optional.empty());

        controller.delete(ctx);

        verify(repo).delete("sch-gone");
        verify(ctx).status(HttpStatus.NO_CONTENT);
    }
}
