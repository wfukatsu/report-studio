package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class V2TemplateExportControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository definitionsRepo;
    private V2TemplateExportController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        definitionsRepo = mock(JsonBlobRepository.class);
        controller = new V2TemplateExportController(definitionsRepo, new RateLimiter(100, 60_000L));
        ctx = mock(Context.class);
        when(ctx.pathParam("id")).thenReturn("tpl-1");
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String makeEnvelope(String id, String name) throws Exception {
        var env = MAPPER.createObjectNode();
        env.put("id", id);
        env.put("name", name);
        env.put("created_at", 1000L);
        env.put("updated_at", 2000L);
        var def = MAPPER.createObjectNode();
        def.put("id", id);
        var meta = def.putObject("metadata");
        meta.put("documentName", name);
        def.putArray("pages").addObject().put("id", "page-1")
            .putArray("elements").addObject().put("id", "el-1").put("type", "text");
        env.set("definition", def);
        return MAPPER.writeValueAsString(env);
    }

    // ── Export tests ──────────────────────────────────────────────────────────

    @Test
    void export_returnsJsonWithFormatVersion2() throws Exception {
        when(definitionsRepo.get("tpl-1")).thenReturn(Optional.of(makeEnvelope("tpl-1", "My Template")));

        controller.export(ctx);

        var resultCaptor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(resultCaptor.capture());
        verify(ctx).contentType("application/json");

        JsonNode exported = MAPPER.readTree(resultCaptor.getValue());
        assertEquals(2, exported.path("formatVersion").asInt());
        assertFalse(exported.path("exportedAt").asText().isEmpty());
        assertTrue(exported.has("definition"));
    }

    @Test
    void export_setsContentDispositionHeader() throws Exception {
        when(definitionsRepo.get("tpl-1")).thenReturn(Optional.of(makeEnvelope("tpl-1", "My Report")));

        controller.export(ctx);

        var headerCaptor = ArgumentCaptor.forClass(String.class);
        verify(ctx).header(eq("Content-Disposition"), headerCaptor.capture());
        assertTrue(headerCaptor.getValue().contains(".rds2.json"));
        assertTrue(headerCaptor.getValue().contains("attachment"));
    }

    @Test
    void export_returns404_whenNotFound() throws Exception {
        when(definitionsRepo.get("tpl-1")).thenReturn(Optional.empty());

        controller.export(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void export_returns400_whenIdInvalid() throws Exception {
        when(ctx.pathParam("id")).thenReturn("../evil");

        controller.export(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    // ── Import tests ───────────────────────────────────────────────────────────

    private String makeExportPackage(String defId, String name) throws Exception {
        var pkg = MAPPER.createObjectNode();
        pkg.put("formatVersion", 2);
        pkg.put("exportedAt", "2026-01-01T00:00:00Z");
        var def = MAPPER.createObjectNode();
        def.put("id", defId);
        var meta = def.putObject("metadata");
        meta.put("documentName", name);
        def.putArray("pages").addObject().put("id", "page-old")
           .putArray("elements").addObject().put("id", "el-old").put("type", "text");
        pkg.set("definition", def);
        return MAPPER.writeValueAsString(pkg);
    }

    @BeforeEach
    void setUpPrincipal() {
        when(ctx.attribute("principal")).thenReturn(
            new Principal("user-1", "User One", Set.of("user")));
    }

    @Test
    void importTemplate_returns201_withNewId() throws Exception {
        when(ctx.body()).thenReturn(makeExportPackage("original-id", "My Template"));

        controller.importTemplate(ctx);

        verify(ctx).status(HttpStatus.CREATED);
        var bodyCaptor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(bodyCaptor.capture());
        @SuppressWarnings("unchecked")
        var result = (java.util.Map<String, String>) bodyCaptor.getValue();
        assertNotEquals("original-id", result.get("id"));
        assertTrue(result.get("name").contains("インポート"));
    }

    @Test
    void importTemplate_regeneratesIds() throws Exception {
        when(ctx.body()).thenReturn(makeExportPackage("orig-id", "Test"));

        controller.importTemplate(ctx);

        var storedCaptor = ArgumentCaptor.forClass(String.class);
        verify(definitionsRepo).put(anyString(), storedCaptor.capture());
        JsonNode stored = MAPPER.readTree(storedCaptor.getValue());
        JsonNode def = stored.path("definition");

        // Top-level ID should be new
        assertNotEquals("orig-id", def.path("id").asText());
        // Page ID should be regenerated
        assertNotEquals("page-old", def.path("pages").get(0).path("id").asText());
        // Element ID should be regenerated
        assertNotEquals("el-old",
            def.path("pages").get(0).path("elements").get(0).path("id").asText());
    }

    @Test
    void importTemplate_setsCreatedBy() throws Exception {
        when(ctx.body()).thenReturn(makeExportPackage("id", "Test"));

        controller.importTemplate(ctx);

        var storedCaptor = ArgumentCaptor.forClass(String.class);
        verify(definitionsRepo).put(anyString(), storedCaptor.capture());
        JsonNode stored = MAPPER.readTree(storedCaptor.getValue());
        assertEquals("user-1", stored.path("created_by").asText());
    }

    @Test
    void importTemplate_returns400_forWrongFormatVersion() throws Exception {
        var pkg = MAPPER.createObjectNode();
        pkg.put("formatVersion", 99);
        pkg.set("definition", MAPPER.createObjectNode());
        when(ctx.body()).thenReturn(MAPPER.writeValueAsString(pkg));

        controller.importTemplate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void importTemplate_returns400_forMissingDefinition() throws Exception {
        var pkg = MAPPER.createObjectNode();
        pkg.put("formatVersion", 2);
        when(ctx.body()).thenReturn(MAPPER.writeValueAsString(pkg));

        controller.importTemplate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void importTemplate_returns400_forInvalidJson() throws Exception {
        when(ctx.body()).thenReturn("not json");

        controller.importTemplate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void importTemplate_returns400_forEmptyBody() throws Exception {
        when(ctx.body()).thenReturn("");

        controller.importTemplate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void importTemplate_returns400_forOversizedBody() throws Exception {
        String huge = "{\"formatVersion\":2,\"definition\":{\"id\":\"x\",\"pages\":[]},\"padding\":\"" + "x".repeat(5_100_000) + "\"}";
        when(ctx.body()).thenReturn(huge);

        controller.importTemplate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }
}
