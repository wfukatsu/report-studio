package com.report.server.job;

import com.report.server.ProjectionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Tests for the parallel batch processor (issue #60): all rows render with
 * per-row error isolation, correct terminal status, and one output file per row.
 */
class BatchPdfProcessorTest {

    /** A minimal V1 projection that renders one blank A4 page. */
    private static final String PROJECTION =
            "{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}";

    private BatchPdfProcessor newProcessor(JobRepository repo, String projection) {
        ProjectionRepository projRepo = mock(ProjectionRepository.class);
        when(projRepo.getProjection(anyString())).thenReturn(Optional.of(projection));
        return new BatchPdfProcessor(projRepo, repo);
    }

    /** An in-memory JobRepository mock backed by a map, with temp output dirs. */
    private JobRepository memoryRepo(Path tmp, String jobId, int total) {
        JobRepository repo = mock(JobRepository.class);
        ConcurrentHashMap<String, JobRecord> store = new ConcurrentHashMap<>();
        store.put(jobId, new JobRecord(jobId, "t1", JobRecord.PENDING, total, 0, 0, null,
                0L, 0L, 0L));
        doAnswer(inv -> { JobRecord r = inv.getArgument(0); store.put(r.jobId(), r); return null; })
                .when(repo).save(any());
        when(repo.findById(anyString())).thenAnswer(inv -> Optional.ofNullable(store.get(inv.getArgument(0))));
        when(repo.getOutputDir(anyString())).thenReturn(tmp.resolve("output"));
        when(repo.getOutputZipPath(anyString())).thenReturn(tmp.resolve("output.zip"));
        return repo;
    }

    private static List<Map<String, String>> rows(int n) {
        List<Map<String, String>> rows = new ArrayList<>();
        for (int i = 0; i < n; i++) rows.add(Map.of("i", String.valueOf(i)));
        return rows;
    }

    @Test
    void runWithData_producesOnePdfPerRow_andCompletes(@TempDir Path tmp) throws Exception {
        JobRepository repo = memoryRepo(tmp, "j1", 25);
        BatchPdfProcessor proc = newProcessor(repo, PROJECTION);

        proc.runWithData("j1", "t1", rows(25));

        // 25 numbered PDFs written
        try (var files = Files.list(tmp.resolve("output"))) {
            long pdfs = files.filter(p -> p.toString().endsWith(".pdf")).count();
            assertEquals(25, pdfs);
        }
        assertTrue(Files.exists(tmp.resolve("output.zip")));
        JobRecord finalRec = repo.findById("j1").orElseThrow();
        assertEquals(JobRecord.COMPLETED, finalRec.status());
        assertEquals(25, finalRec.processedItems());
        assertEquals(0, finalRec.failedItems());
    }

    @Test
    void run_countMode_producesRequestedPageCount(@TempDir Path tmp) throws Exception {
        JobRepository repo = memoryRepo(tmp, "j2", 12);
        BatchPdfProcessor proc = newProcessor(repo, PROJECTION);

        proc.run("j2", "t1", 12);

        try (var files = Files.list(tmp.resolve("output"))) {
            assertEquals(12, files.filter(p -> p.toString().endsWith(".pdf")).count());
        }
        assertEquals(JobRecord.COMPLETED, repo.findById("j2").orElseThrow().status());
    }

    @Test
    void perRowError_isIsolated_jobStillCompletes(@TempDir Path tmp) throws Exception {
        JobRepository repo = memoryRepo(tmp, "j3", 5);
        // Invalid projection JSON → every render throws, but the job must not crash
        BatchPdfProcessor proc = newProcessor(repo, "not-json{");

        proc.runWithData("j3", "t1", rows(5));

        JobRecord rec = repo.findById("j3").orElseThrow();
        assertEquals(JobRecord.COMPLETED, rec.status());
        assertEquals(0, rec.processedItems());
        assertEquals(5, rec.failedItems());
    }

    @Test
    void cancel_stopsBeforeAllRowsAndMarksCancelled(@TempDir Path tmp) throws Exception {
        JobRepository repo = memoryRepo(tmp, "j4", 200);
        BatchPdfProcessor proc = newProcessor(repo, PROJECTION);

        // Cancel almost immediately, then run — the loop stops submitting new rows
        proc.requestCancel("j4");
        proc.runWithData("j4", "t1", rows(200));

        JobRecord rec = repo.findById("j4").orElseThrow();
        assertEquals("CANCELLED", rec.status());
        assertTrue(rec.processedItems() < 200, "cancel should stop before all rows: " + rec.processedItems());
    }
}
