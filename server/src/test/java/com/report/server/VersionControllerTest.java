package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class VersionControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private VersionController.V2VersionRepository mockVersionRepo;
    private JsonBlobRepository mockDefinitionsRepo;
    private VersionController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        mockVersionRepo = mock(VersionController.V2VersionRepository.class);
        mockDefinitionsRepo = mock(JsonBlobRepository.class);
        // Package-private constructor accepting pre-built mock repository
        controller = new VersionController(mockVersionRepo, mockDefinitionsRepo);
        ctx = mock(Context.class);
        when(ctx.pathParam("id")).thenReturn("t1");
        when(ctx.pathParam("vid")).thenReturn("v1");
    }

    // ── list ──────────────────────────────────────────────────────────────────

    @Test
    void list_returnsVersionsAsArray() throws Exception {
        long ts1 = 1_000_000L, ts2 = 2_000_000L;
        when(mockVersionRepo.listVersions("t1"))
                .thenReturn(
                        List.of(
                                new VersionController.V2VersionRepository.VersionMeta(
                                        "v2", "t1", ts2, null),
                                new VersionController.V2VersionRepository.VersionMeta(
                                        "v1", "t1", ts1, "user@example.com")));

        controller.list(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode arr = MAPPER.readTree(captor.getValue());
        assertTrue(arr.isArray());
        assertEquals(2, arr.size());
        assertEquals("v2", arr.get(0).path("id").asText());
        assertEquals("v1", arr.get(1).path("id").asText());
        assertEquals("user@example.com", arr.get(1).path("createdBy").asText());
    }

    @Test
    void list_omitsCreatedByWhenNull() throws Exception {
        when(mockVersionRepo.listVersions("t1"))
                .thenReturn(
                        List.of(
                                new VersionController.V2VersionRepository.VersionMeta(
                                        "v1", "t1", 1000L, null)));

        controller.list(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode item = MAPPER.readTree(captor.getValue()).get(0);
        assertFalse(item.has("createdBy"));
    }

    @Test
    void list_returns400ForInvalidId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("../../bad");

        controller.list(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(mockVersionRepo, never()).listVersions(any());
    }

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void create_snapshotsDefinitionAndReturns201() throws Exception {
        String defJson = "{\"id\":\"t1\",\"metadata\":{\"documentName\":\"Test\"}}";
        String envelope =
                MAPPER.createObjectNode()
                        .put("id", "t1")
                        .put("name", "Test")
                        .put("created_at", 1000L)
                        .put("updated_at", 2000L)
                        .set("definition", MAPPER.readTree(defJson))
                        .toString();
        when(mockDefinitionsRepo.get("t1")).thenReturn(Optional.of(envelope));

        controller.create(ctx);

        verify(ctx).status(HttpStatus.CREATED);
        verify(mockVersionRepo).createVersion(anyString(), eq("t1"), eq(defJson), anyLong());

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertNotNull(resp.path("id").asText(null));
        assertTrue(resp.path("versionNumber").asLong() > 0);
        assertFalse(resp.path("createdAt").asText("").isBlank());
    }

    @Test
    void create_returns404WhenTemplateNotFound() throws Exception {
        when(mockDefinitionsRepo.get("t1")).thenReturn(Optional.empty());

        controller.create(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(mockVersionRepo, never()).createVersion(any(), any(), any(), anyLong());
    }

    @Test
    void create_returns404WhenEnvelopeLacksDefinition() throws Exception {
        String noDefEnvelope =
                MAPPER.createObjectNode().put("id", "t1").put("name", "x").toString();
        when(mockDefinitionsRepo.get("t1")).thenReturn(Optional.of(noDefEnvelope));

        controller.create(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(mockVersionRepo, never()).createVersion(any(), any(), any(), anyLong());
    }

    // ── restore ───────────────────────────────────────────────────────────────

    @Test
    void restore_returnsCanonicalEnvelope() throws Exception {
        String defJson = "{\"id\":\"t1\",\"pages\":[]}";
        when(mockVersionRepo.getVersion("v1", "t1")).thenReturn(Optional.of(defJson));

        controller.restore(ctx);

        verify(ctx).contentType("application/json");
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        var resource = MAPPER.readTree(captor.getValue());
        assertEquals(
                TemplateEnvelope.CURRENT_FORMAT_VERSION, resource.path("formatVersion").asInt());
        assertEquals("t1", resource.path("definition").path("id").asText());
    }

    @Test
    void restore_returns404WhenVersionNotFound() throws Exception {
        when(mockVersionRepo.getVersion("v1", "t1")).thenReturn(Optional.empty());

        controller.restore(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void restore_returns400ForInvalidVersionId() throws Exception {
        when(ctx.pathParam("vid")).thenReturn("../escape");

        controller.restore(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(mockVersionRepo, never()).getVersion(any(), any());
    }

    @Test
    void restore_returns400ForInvalidTemplateId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("bad id!");

        controller.restore(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(mockVersionRepo, never()).getVersion(any(), any());
    }
}
