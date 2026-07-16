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
class V2BatchPdfControllerTest {

    private JsonBlobRepository definitionsRepo;
    private JsonBlobRepository responseRepo;
    private InMemoryJobStore jobStore;
    private ExecutorService executor;
    private V2BatchPdfController controller;
    private Context ctx;
    private Object capturedJson;
    private int capturedStatus = 200;

    @BeforeEach
    void setUp() {
        definitionsRepo = mock(JsonBlobRepository.class);
        responseRepo = mock(JsonBlobRepository.class);
        jobStore = new InMemoryJobStore();
        executor = Executors.newSingleThreadExecutor();
        controller = new V2BatchPdfController(definitionsRepo, responseRepo, jobStore, executor);

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
}
