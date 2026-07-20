package com.report.server.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.javalin.http.Context;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Unit tests for {@link JobController#list} — the paginated, bounded v1 job listing (#210). */
class JobControllerTest {

    private JobRepository jobRepo;
    private JobController controller;
    private Context ctx;
    private Object capturedJson;

    @BeforeEach
    void setUp() {
        jobRepo = mock(JobRepository.class);
        controller =
                new JobController(
                        jobRepo, mock(BatchPdfProcessor.class), mock(ExecutorService.class));
        ctx = mock(Context.class);
        org.mockito.Mockito.doAnswer(
                        inv -> {
                            capturedJson = inv.getArgument(0);
                            return ctx;
                        })
                .when(ctx)
                .json(org.mockito.ArgumentMatchers.any());
        when(ctx.header(anyString(), anyString())).thenReturn(ctx);
    }

    private void stubJobs(int count) {
        List<JobRecord> jobs = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            jobs.add(JobRecord.create("job-" + i, "t1", JobRecord.TYPE_V1_BATCH, null, 1, 0));
        }
        when(jobRepo.listAll()).thenReturn(jobs);
    }

    @SuppressWarnings("unchecked")
    private List<JobRecord> captured() {
        return (List<JobRecord>) capturedJson;
    }

    @Test
    void list_capsToLimit_andReportsTotalCount() {
        stubJobs(5);
        when(ctx.queryParam("limit")).thenReturn("2");

        controller.list(ctx);

        assertEquals(2, captured().size(), "returned page must honour the requested limit");
        verify(ctx).header("X-Total-Count", "5");
    }

    @Test
    void list_defaultLimitBounded_returnsAllWhenFewer() {
        stubJobs(3);

        controller.list(ctx);

        assertEquals(3, captured().size());
        verify(ctx).header("X-Total-Count", "3");
    }

    @Test
    void list_offsetPastEnd_returnsEmpty() {
        stubJobs(3);
        when(ctx.queryParam("offset")).thenReturn("10");

        controller.list(ctx);

        assertEquals(0, captured().size());
        verify(ctx).header("X-Total-Count", "3");
    }

    @Test
    void list_limitClampedToMax() {
        stubJobs(600);
        when(ctx.queryParam("limit")).thenReturn("99999");

        controller.list(ctx);

        assertEquals(500, captured().size(), "limit must be clamped to JOBS_MAX_LIMIT (500)");
        verify(ctx).header("X-Total-Count", "600");
    }

    @Test
    void list_excludesNonV1Jobs() {
        List<JobRecord> jobs = new ArrayList<>();
        jobs.add(JobRecord.create("v1", "t1", JobRecord.TYPE_V1_BATCH, null, 1, 0));
        jobs.add(JobRecord.create("v2", "t1", JobRecord.TYPE_V2_BATCH, "alice", 1, 0));
        when(jobRepo.listAll()).thenReturn(jobs);

        controller.list(ctx);

        assertEquals(1, captured().size(), "only v1 jobs belong to the v1 listing");
        verify(ctx).header("X-Total-Count", "1");
    }
}
