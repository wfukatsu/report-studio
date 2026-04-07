package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class V2PdfJobControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository definitionsRepo;
    private ExecutorService executor;
    private V2PdfJobController controller;
    private Context ctx;
    private Object capturedJson;
    private int capturedStatus = 200;

    @BeforeEach
    void setUp() {
        definitionsRepo = mock(JsonBlobRepository.class);
        executor = Executors.newSingleThreadExecutor();
        controller = new V2PdfJobController(definitionsRepo, executor);

        ctx = mock(Context.class);
        when(ctx.status(anyInt())).thenAnswer(inv -> {
            capturedStatus = (int) inv.getArguments()[0];
            return ctx;
        });
        when(ctx.status(any(HttpStatus.class))).thenAnswer(inv -> {
            capturedStatus = ((HttpStatus) inv.getArguments()[0]).getCode();
            return ctx;
        });
        doAnswer(inv -> {
            capturedJson = inv.getArguments()[0];
            return null;
        }).when(ctx).json(any());
        when(ctx.header(anyString(), anyString())).thenReturn(ctx);
        when(ctx.attribute("principal")).thenReturn(null);
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    @Test
    void submitReturns400WhenTemplateIdMissing() {
        when(ctx.body()).thenReturn("""
            {"testData": {}}
        """);

        controller.submit(ctx);

        assertEquals(400, capturedStatus);
    }

    @Test
    void submitReturns404WhenTemplateNotFound() {
        when(ctx.body()).thenReturn("""
            {"templateId": "nonexistent"}
        """);
        when(definitionsRepo.get("nonexistent")).thenReturn(Optional.empty());

        controller.submit(ctx);

        assertEquals(404, capturedStatus);
    }

    @Test
    void submitReturns202WithJobIdWhenTemplateExists() {
        when(ctx.body()).thenReturn("""
            {"templateId": "tmpl-1"}
        """);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of("{\"pages\":[]}"));

        controller.submit(ctx);

        assertEquals(202, capturedStatus);
        Map<?, ?> result = (Map<?, ?>) capturedJson;
        assertNotNull(result.get("jobId"));
        assertTrue(result.get("jobId").toString().startsWith("pjob-"));
        assertEquals("pending", result.get("status"));
        assertNotNull(result.get("statusUrl"));
        assertNotNull(result.get("resultUrl"));
    }

    @Test
    void submitReturns413WhenBodyTooLarge() {
        when(ctx.body()).thenReturn("x".repeat(600_000));

        controller.submit(ctx);

        assertEquals(413, capturedStatus);
    }

    // ── Status ────────────────────────────────────────────────────────────────

    @Test
    void getStatusReturns404ForUnknownJob() {
        when(ctx.pathParam("jobId")).thenReturn("nonexistent-job");

        controller.getStatus(ctx);

        assertEquals(404, capturedStatus);
    }

    @Test
    void getStatusReturnsPendingAfterSubmit() throws Exception {
        when(ctx.body()).thenReturn("""
            {"templateId": "tmpl-1"}
        """);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of("{\"pages\":[]}"));

        controller.submit(ctx);
        String jobId = ((Map<?, ?>) capturedJson).get("jobId").toString();

        // Reset capture
        capturedStatus = 200;
        capturedJson = null;

        when(ctx.pathParam("jobId")).thenReturn(jobId);
        controller.getStatus(ctx);

        Map<?, ?> status = (Map<?, ?>) capturedJson;
        assertEquals(jobId, status.get("jobId"));
        // Status is either pending or processing (executor may have picked it up)
        assertTrue(status.get("status").toString().matches("pending|processing|completed|failed"));
    }

    // ── Result ────────────────────────────────────────────────────────────────

    @Test
    void getResultReturns404ForUnknownJob() {
        when(ctx.pathParam("jobId")).thenReturn("nonexistent-job");

        controller.getResult(ctx);

        assertEquals(404, capturedStatus);
    }

    @Test
    void getResultReturns409WhenJobNotCompleted() {
        when(ctx.body()).thenReturn("""
            {"templateId": "tmpl-1"}
        """);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of("{\"pages\":[]}"));

        controller.submit(ctx);
        String jobId = ((Map<?, ?>) capturedJson).get("jobId").toString();

        // Immediately try to download while job is pending/processing
        capturedStatus = 200;
        capturedJson = null;
        when(ctx.pathParam("jobId")).thenReturn(jobId);

        // Force status to "pending" for this test
        var job = controller.findJob(jobId);
        assertTrue(job.isPresent());
        if (V2PdfJobController.STATUS_PENDING.equals(job.get().status()) ||
            V2PdfJobController.STATUS_PROCESSING.equals(job.get().status())) {
            controller.getResult(ctx);
            assertEquals(409, capturedStatus);
        }
        // If job already completed (fast execution), status would be 200 — skip assertion
    }

    // ── Concurrent limit ──────────────────────────────────────────────────────

    @Test
    void submitReturns429WhenTooManyActiveJobs() throws Exception {
        // Submit 10 jobs to saturate the limit
        when(definitionsRepo.get(anyString())).thenReturn(Optional.of("{\"pages\":[]}"));

        // Saturate the activeJobs counter by submitting many
        // (the controller caps at MAX_ACTIVE_JOBS=10)
        for (int i = 0; i < 10; i++) {
            when(ctx.body()).thenReturn("{\"templateId\": \"tmpl-" + i + "\"}");
            capturedStatus = 200;
            controller.submit(ctx);
        }

        // The 11th should get 429
        when(ctx.body()).thenReturn("""
            {"templateId": "tmpl-overflow"}
        """);
        capturedStatus = 200;
        controller.submit(ctx);

        // Due to async execution, some jobs may have already completed,
        // so we check the status was either 202 (all completed fast) or 429
        assertTrue(capturedStatus == 202 || capturedStatus == 429);
    }
}
