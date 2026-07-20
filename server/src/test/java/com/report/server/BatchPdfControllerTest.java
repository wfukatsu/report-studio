package com.report.server;

import com.report.server.auth.Principal;
import com.report.server.job.JobRecord;
import com.report.server.testsupport.InMemoryJobStore;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

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
        // Default principal: alice. Status/result reads are now owner-scoped (#199), so the
        // caller must match the job owner ("alice" in the read-path fixtures).
        when(ctx.attribute("principal")).thenReturn(user("alice"));
    }

    /** Real (non-anonymous) principal with the default "user" role. */
    private Principal user(String id) {
        return new Principal(id, id, java.util.Set.of("user"));
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

    // ── Owner-scoped access (issue #199) ───────────────────────────────────────

    @Test
    void getStatus_otherUsersJob_404() {
        jobStore.save(JobRecord.create("batch-1", "t1", JobRecord.TYPE_V2_BATCH, "bob", 3, 0));
        when(ctx.pathParam("id")).thenReturn("batch-1");
        when(ctx.attribute("principal")).thenReturn(user("alice")); // not the owner

        controller.getStatus(ctx);

        assertEquals(404, capturedStatus);
    }

    @Test
    void getResult_otherUsersJob_404_doesNotDelete() {
        jobStore.save(JobRecord.create("batch-1", "t1", JobRecord.TYPE_V2_BATCH, "bob", 1, 0)
                .withArtifact("/tmp/does-not-matter.zip"));
        when(ctx.pathParam("id")).thenReturn("batch-1");
        when(ctx.attribute("principal")).thenReturn(user("alice")); // not the owner

        controller.getResult(ctx);

        assertEquals(404, capturedStatus);
        // The one-shot delete must not have run — bob's job is still present.
        assertTrue(jobStore.findById("batch-1").isPresent(), "non-owner must not destroy the job");
    }

    @Test
    void getStatus_adminCanReadAnyJob() {
        jobStore.save(JobRecord.create("batch-1", "t1", JobRecord.TYPE_V2_BATCH, "bob", 3, 0).withProgress(1, 0));
        when(ctx.pathParam("id")).thenReturn("batch-1");
        when(ctx.attribute("principal")).thenReturn(new Principal("root", "root", java.util.Set.of("admin")));

        controller.getStatus(ctx);

        assertEquals(200, capturedStatus);
    }

    // ── getResult streams the ZIP off-disk, one-shot delete on close (#210) ─────

    @Test
    void getResult_streamsZip_andDeletesJobOnStreamClose() throws Exception {
        java.nio.file.Path zip = java.nio.file.Files.createTempFile("batch-result", ".zip");
        java.nio.file.Files.write(zip, new byte[]{1, 2, 3, 4});
        jobStore.save(JobRecord.create("batch-1", "t1", JobRecord.TYPE_V2_BATCH, "alice", 1, 0)
                .withArtifact(zip.toString())); // withArtifact → status COMPLETED + artifactPath
        when(ctx.pathParam("id")).thenReturn("batch-1");

        controller.getResult(ctx);

        // Streamed, not buffered to a byte[]: result is an InputStream.
        ArgumentCaptor<java.io.InputStream> stream = ArgumentCaptor.forClass(java.io.InputStream.class);
        verify(ctx).result(stream.capture());
        // One-shot delete is deferred until the stream is fully written (closed).
        assertTrue(jobStore.findById("batch-1").isPresent(), "job must survive until the stream closes");
        stream.getValue().close();
        assertTrue(jobStore.findById("batch-1").isEmpty(), "job dropped after the download completes");

        java.nio.file.Files.deleteIfExists(zip);
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
