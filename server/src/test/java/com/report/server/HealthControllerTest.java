package com.report.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.job.JobRecord;
import com.report.server.job.JobStore;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

/** Unit tests for {@link HealthController} — detailed health + metrics endpoints. */
class HealthControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TransactionFactory factory;
    private DistributedTransactionAdmin admin;
    private JobStore jobStore;
    private Metrics metrics;
    private Context ctx;
    private HealthController controller;

    @TempDir Path jobsRoot;

    @BeforeEach
    void setUp() throws Exception {
        factory = mock(TransactionFactory.class);
        admin = mock(DistributedTransactionAdmin.class);
        jobStore = mock(JobStore.class);
        metrics = new Metrics();

        when(factory.getTransactionAdmin()).thenReturn(admin);

        controller = new HealthController(factory, jobStore, jobsRoot, metrics);

        ctx = mock(Context.class);
        when(ctx.status(anyInt())).thenReturn(ctx);
    }

    private JsonNode capturedJson() {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        return MAPPER.valueToTree(captor.getValue());
    }

    private static JobRecord pendingJob(String id) {
        return new JobRecord(id, "tpl", JobRecord.PENDING, 10, 0, 0, null, 0, 0, 0);
    }

    // ── detailed health ─────────────────────────────────────────────────────────

    @Test
    void detailed_allHealthy_reportsScalarDbUpAndEmptyQueue() throws Exception {
        when(admin.namespaceExists("report_studio")).thenReturn(true);
        when(jobStore.listAll()).thenReturn(List.of());

        controller.detailed(ctx);

        verify(ctx).status(200); // not 503
        JsonNode body = capturedJson();
        assertNotEquals(
                "DOWN",
                body.get("status").asText()); // UP (or DEGRADED only if the test disk is near-full)
        assertEquals("up", body.get("scalardb").get("status").asText());
        assertEquals(0, body.get("jobs").get("backlog").asLong());
        assertTrue(body.get("scalardb").has("latencyMillis"));
    }

    @Test
    void detailed_scalarDbUnreachable_returns503Down() throws Exception {
        when(admin.namespaceExists(anyString())).thenThrow(new RuntimeException("no connection"));
        when(jobStore.listAll()).thenReturn(List.of());

        controller.detailed(ctx);

        verify(ctx).status(503);
        JsonNode body = capturedJson();
        assertEquals("DOWN", body.get("status").asText());
        assertEquals("down", body.get("scalardb").get("status").asText());
    }

    @Test
    void detailed_deepJobBacklog_reportsDegraded() throws Exception {
        when(admin.namespaceExists("report_studio")).thenReturn(true);
        List<JobRecord> many = new ArrayList<>();
        for (int i = 0; i < HealthController.QUEUE_BACKLOG_DEGRADED; i++) {
            many.add(pendingJob("job-" + i));
        }
        when(jobStore.listAll()).thenReturn(many);

        controller.detailed(ctx);

        verify(ctx).status(200); // degraded is still reachable, not down
        JsonNode body = capturedJson();
        assertEquals("DEGRADED", body.get("status").asText());
        assertEquals(
                HealthController.QUEUE_BACKLOG_DEGRADED, body.get("jobs").get("backlog").asLong());
        assertTrue(body.get("jobs").get("degraded").asBoolean());
    }

    // ── metrics ──────────────────────────────────────────────────────────────────

    @Test
    void metrics_returnsCurrentSnapshot() {
        metrics.recordPdfRender(50, true);
        metrics.recordRateLimitTrip();

        controller.metrics(ctx);

        JsonNode snap = capturedJson();
        assertEquals(1, snap.get("pdf").get("count").asLong());
        assertEquals(50, snap.get("pdf").get("lastMillis").asLong());
        assertEquals(1, snap.get("rateLimit").get("trips").asLong());
    }
}
