package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.mockito.Mockito.*;

class GenericJsonControllerTest {

    private JsonBlobRepository repo;
    private GenericJsonController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        repo = mock(JsonBlobRepository.class);
        controller = new GenericJsonController(repo, "test-resource", "{}");
        ctx = mock(Context.class);
    }

    @Test
    void get_returnsStoredJson() {
        when(ctx.pathParam("id")).thenReturn("id-1");
        when(repo.get("id-1")).thenReturn(Optional.of("{\"key\":\"value\"}"));

        controller.get(ctx);

        verify(ctx).status(HttpStatus.OK);
        verify(ctx).result("{\"key\":\"value\"}");
    }

    @Test
    void get_returnsDefaultWhenNotFound() {
        when(ctx.pathParam("id")).thenReturn("missing");
        when(repo.get("missing")).thenReturn(Optional.empty());

        controller.get(ctx);

        verify(ctx).status(HttpStatus.OK);
        verify(ctx).result("{}");
    }

    @Test
    void put_savesJson() {
        when(ctx.pathParam("id")).thenReturn("id-1");
        when(ctx.body()).thenReturn("{\"data\":true}");

        controller.put(ctx);

        verify(repo).put("id-1", "{\"data\":true}");
        verify(ctx).status(HttpStatus.OK);
    }

    @Test
    void put_rejectsEmptyBody() {
        when(ctx.pathParam("id")).thenReturn("id-1");
        when(ctx.body()).thenReturn("  ");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(any(), any());
    }

    @Test
    void put_rejectsNullBody() {
        when(ctx.pathParam("id")).thenReturn("id-1");
        when(ctx.body()).thenReturn(null);

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).put(any(), any());
    }
}
