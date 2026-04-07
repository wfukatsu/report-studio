package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectionControllerTest {

    private ProjectionRepository repo;
    private VersionRepository versionRepo;
    private ProjectionController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        repo = mock(ProjectionRepository.class);
        versionRepo = mock(VersionRepository.class);
        controller = new ProjectionController(repo, versionRepo);
        ctx = mock(Context.class);
    }

    @Test
    void get_returnsStoredProjection() {
        when(ctx.pathParam("id")).thenReturn("t1");
        when(repo.getProjection("t1")).thenReturn(Optional.of("{\"templates\":[]}"));

        controller.get(ctx);

        verify(ctx).status(HttpStatus.OK);
        verify(ctx).result("{\"templates\":[]}");
    }

    @Test
    void get_returnsEmptyProjectionWhenNotFound() {
        when(ctx.pathParam("id")).thenReturn("missing");
        when(repo.getProjection("missing")).thenReturn(Optional.empty());

        controller.get(ctx);

        verify(ctx).status(HttpStatus.OK);
        verify(ctx).result("{\"templates\":[]}");
    }

    @Test
    void put_savesProjection() {
        when(ctx.pathParam("id")).thenReturn("t1");
        when(ctx.body()).thenReturn("{\"templates\":[{\"id\":\"t1\"}]}");

        controller.put(ctx);

        verify(repo).putProjection("t1", "{\"templates\":[{\"id\":\"t1\"}]}");
        verify(ctx).status(HttpStatus.OK);
    }

    @Test
    void put_rejectsEmptyBody() {
        when(ctx.pathParam("id")).thenReturn("t1");
        when(ctx.body()).thenReturn("");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).putProjection(any(), any());
    }

    @Test
    void put_rejectsInvalidFormat() {
        when(ctx.pathParam("id")).thenReturn("t1");
        when(ctx.body()).thenReturn("{\"invalid\":true}");

        controller.put(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(repo, never()).putProjection(any(), any());
    }
}
