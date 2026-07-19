package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.concurrent.Executors;

import static org.mockito.Mockito.*;

class ThumbnailControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository definitionsRepo;
    private ThumbnailController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        definitionsRepo = mock(JsonBlobRepository.class);
        controller = new ThumbnailController(definitionsRepo,
                Executors.newSingleThreadExecutor());
        ctx = mock(Context.class);
        when(ctx.pathParam("id")).thenReturn("tpl-1");
        when(ctx.header("If-None-Match")).thenReturn(null);
    }

    private String makeEnvelope(String id) throws Exception {
        ObjectNode env = MAPPER.createObjectNode();
        env.put("id", id);
        env.put("name", "Test");
        ObjectNode def = MAPPER.createObjectNode();
        def.put("id", id);
        def.putObject("metadata").put("documentName", "Test").put("version", "1.0").put("reportType", "general");
        ObjectNode ps = def.putObject("pageSettings");
        ps.put("paperSize", "A4");
        ps.put("orientation", "portrait");
        ps.put("unit", "mm");
        ps.putObject("margins").put("top", 20).put("right", 20).put("bottom", 20).put("left", 20);
        def.putObject("defaultTextStyle");
        def.putArray("templateVariables");
        def.putArray("calculationRules");
        def.putArray("dataSources");
        def.putArray("outputVariants");
        def.putArray("submissionModels");
        def.putArray("validationRules");
        def.putArray("pages").addObject()
                .put("id", "page-1")
                .put("name", "Page 1")
                .put("width", 210)
                .put("height", 297)
                .put("background", "#ffffff")
                .putArray("sections").addObject()
                        .put("id", "sec-1")
                        .put("sectionType", "body")
                        .put("height", 257)
                        .putArray("elements");
        env.set("definition", def);
        return MAPPER.writeValueAsString(env);
    }

    @Test
    void get_returns404_whenTemplateNotFound() throws Exception {
        when(definitionsRepo.get("tpl-1")).thenReturn(Optional.empty());

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void get_returns400_whenIdInvalid() throws Exception {
        when(ctx.pathParam("id")).thenReturn("../evil");

        controller.get(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void get_returns304_whenETagMatches() throws Exception {
        when(definitionsRepo.get("tpl-1")).thenReturn(Optional.of(makeEnvelope("tpl-1")));

        // ETag is computed from the prepared V2 definition (issue #52)
        String env = makeEnvelope("tpl-1");
        com.fasterxml.jackson.databind.JsonNode envNode = MAPPER.readTree(env);
        String definitionJson = V2RenderSupport.prepare(
                envNode.path("definition"), MAPPER.createObjectNode(), null);
        String etag = ThumbnailGenerator.computeETag(definitionJson);

        when(ctx.header("If-None-Match")).thenReturn(etag);
        controller.get(ctx);

        verify(ctx).status(304);
        verify(ctx, never()).contentType(anyString());
    }

    @Test
    void get_returns404_whenDefinitionMissing() throws Exception {
        ObjectNode env = MAPPER.createObjectNode();
        env.put("id", "tpl-1");
        env.put("name", "No Def");
        // no "definition" field
        when(definitionsRepo.get("tpl-1")).thenReturn(Optional.of(MAPPER.writeValueAsString(env)));

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }
}
