package com.report.server;

import com.report.server.auth.Principal;
import com.report.server.job.JobRecord;
import com.report.server.testsupport.InMemoryJobStore;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Validation and status behavior of the batch PDF job endpoints on the
 * unified job store (issue #60).
 */
class BatchPdfControllerTest {

    private JsonBlobRepository definitionsRepo;
    private JsonBlobRepository responseRepo;
    private InMemoryJobStore jobStore;
    private ExecutorService executor;
    private BatchPdfController controller;
    private Context ctx;
    private Object capturedJson;
    private int capturedStatus = 200;

    @BeforeEach
    void setUp() {
        definitionsRepo = mock(JsonBlobRepository.class);
        responseRepo = mock(JsonBlobRepository.class);
        jobStore = new InMemoryJobStore();
        executor = Executors.newSingleThreadExecutor();
        controller = new BatchPdfController(definitionsRepo, responseRepo, jobStore, executor);

        ctx = mock(Context.class);
        when(ctx.status(any(HttpStatus.class))).thenAnswer(inv -> {
            capturedStatus = ((HttpStatus) inv.getArguments()[0]).getCode();
            return ctx;
        });
        doAnswer(inv -> { capturedJson = inv.getArguments()[0]; return null; })
                .when(ctx).json(any());
        when(ctx.header(anyString(), anyString())).thenReturn(ctx);
    }

    private Principal user(String id) {
        Principal p = mock(Principal.class);
        when(p.userId()).thenReturn(id);
        when(p.isAnonymous()).thenReturn(false);
        return p;
    }

    @Test
    void submitBatch_requiresAuthentication() throws Exception {
        when(ctx.attribute("principal")).thenReturn(null);
        controller.submitBatch(ctx);
        assertEquals(401, capturedStatus);
    }

    @Test
    void submitBatch_rejectsMissingTemplateId() throws Exception {
        Principal alice = user("alice");
        when(ctx.attribute("principal")).thenReturn(alice);
        when(ctx.body()).thenReturn("{\"responseIds\":[\"r1\"]}");
        controller.submitBatch(ctx);
        assertEquals(400, capturedStatus);
    }

    @Test
    void submitBatch_rejectsEmptyResponseIds() throws Exception {
        Principal alice = user("alice");
        when(ctx.attribute("principal")).thenReturn(alice);
        when(ctx.body()).thenReturn("{\"templateId\":\"t1\",\"responseIds\":[]}");
        controller.submitBatch(ctx);
        assertEquals(400, capturedStatus);
    }

    @Test
    void submitBatch_returns404ForUnknownTemplate() throws Exception {
        Principal alice = user("alice");
        when(ctx.attribute("principal")).thenReturn(alice);
        when(ctx.body()).thenReturn("{\"templateId\":\"missing\",\"responseIds\":[\"r1\"]}");
        when(definitionsRepo.get("missing")).thenReturn(Optional.empty());
        controller.submitBatch(ctx);
        assertEquals(404, capturedStatus);
    }

    @Test
    void submitBatch_persistsJobInStore() throws Exception {
        Principal alice = user("alice");
        when(ctx.attribute("principal")).thenReturn(alice);
        when(ctx.body()).thenReturn("{\"templateId\":\"t1\",\"responseIds\":[\"r1\",\"r2\"]}");
        when(definitionsRepo.get("t1")).thenReturn(Optional.of("{\"pages\":[]}"));
        when(responseRepo.get(anyString())).thenReturn(Optional.empty());

        controller.submitBatch(ctx);

        assertEquals(202, capturedStatus);
        var jobs = jobStore.listAll();
        assertEquals(1, jobs.size());
        JobRecord job = jobs.get(0);
        assertEquals(JobRecord.TYPE_V2_BATCH, job.jobType());
        assertEquals("alice", job.owner());
        assertEquals(2, job.totalItems());
        assertTrue(job.expiresAt() > System.currentTimeMillis());
    }

    @Test
    void getStatus_returns404ForUnknownJob() {
        when(ctx.pathParam("id")).thenReturn("batch-missing");
        controller.getStatus(ctx);
        assertEquals(404, capturedStatus);
    }

    @Test
    void getStatus_ignoresJobsOfOtherTypes() {
        jobStore.save(JobRecord.create("job-v1", "t1", JobRecord.TYPE_V1_BATCH, null, 1, 0));
        when(ctx.pathParam("id")).thenReturn("job-v1");
        controller.getStatus(ctx);
        assertEquals(404, capturedStatus);
    }

    @Test
    void getStatus_reportsLowercaseStatusAndCounts() {
        jobStore.save(JobRecord.create("batch-1", "t1", JobRecord.TYPE_V2_BATCH, "alice", 3, 0)
                .withProgress(2, 1));
        when(ctx.pathParam("id")).thenReturn("batch-1");

        controller.getStatus(ctx);

        var resp = (com.fasterxml.jackson.databind.node.ObjectNode) capturedJson;
        assertEquals("batch-1", resp.get("batchJobId").asText());
        assertEquals("pending", resp.get("status").asText());
        assertEquals(3, resp.get("total").asInt());
        assertEquals(2, resp.get("completed").asInt());
        assertEquals(1, resp.get("failed").asInt());
    }

    @Test
    void getResult_returns409WhenNotCompleted() {
        jobStore.save(JobRecord.create("batch-1", "t1", JobRecord.TYPE_V2_BATCH, "alice", 1, 0));
        when(ctx.pathParam("id")).thenReturn("batch-1");
        controller.getResult(ctx);
        assertEquals(409, capturedStatus);
    }

    /**
     * Issue #204: the batch coordinator must not run on {@code pdfExecutor}. Here that pool
     * has a single thread and the batch produces real render tasks submitted to it. If the
     * coordinator also ran on {@code pdfExecutor}, it would seize the only thread and then
     * block on {@code allOf().get()} waiting for render tasks that can never be scheduled —
     * a deadlock that would leave the job non-terminal until the 5-minute timeout. With the
     * coordinator on its own pool, the job reaches a terminal state promptly.
     */
    @Test
    void submitBatch_coordinatorDoesNotStarvePdfExecutor() throws Exception {
        Principal alice = user("alice");
        when(ctx.attribute("principal")).thenReturn(alice);
        when(ctx.body()).thenReturn("{\"templateId\":\"t1\",\"responseIds\":[\"r1\",\"r2\",\"r3\"]}");
        when(definitionsRepo.get("t1"))
                .thenReturn(Optional.of("{\"definition\":{\"pages\":[]}}"));
        // Valid responses → each input becomes a real render task on the single-thread pdfExecutor
        // (the deadlock-prone path), not a short-circuited "not found" completed future.
        when(responseRepo.get(anyString()))
                .thenReturn(Optional.of("{\"data\":{\"field\":\"value\"}}"));

        controller.submitBatch(ctx);
        assertEquals(202, capturedStatus);

        // Poll for a terminal state. Without the fix this never happens (deadlock) and the
        // test fails on timeout; with the fix it settles in well under a second.
        long deadline = System.currentTimeMillis() + 15_000;
        JobRecord job = null;
        while (System.currentTimeMillis() < deadline) {
            job = jobStore.listAll().stream().findFirst().orElse(null);
            if (job != null && job.isTerminal()) break;
            Thread.sleep(25);
        }
        assertNotNull(job, "batch job should have been persisted");
        assertTrue(job.isTerminal(),
                "batch job must reach a terminal state — a non-terminal job indicates the "
                        + "coordinator/render pool deadlock (#204)");
    }
}
