package com.report.server.job;

import com.report.server.CsvDataSource;
import com.report.server.RequestValidator;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import io.javalin.http.UploadedFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * HTTP handlers for batch job endpoints.
 *
 * POST   /api/v1/jobs           — submit new job
 * GET    /api/v1/jobs           — list all jobs
 * GET    /api/v1/jobs/{id}      — job status + progress
 * GET    /api/v1/jobs/{id}/output — download ZIP
 */
public final class JobController {

    private static final Logger log = LoggerFactory.getLogger(JobController.class);
    private static final int MAX_ACTIVE_JOBS = 20;
    private static final int MAX_ROW_COUNT = 10_000;

    private final JobRepository jobRepo;
    private final BatchPdfProcessor processor;
    private final ExecutorService executor;
    private final AtomicInteger activeJobs = new AtomicInteger(0);

    public JobController(JobRepository jobRepo, BatchPdfProcessor processor, ExecutorService executor) {
        this.jobRepo = jobRepo;
        this.processor = processor;
        this.executor = executor;
    }

    /** POST /api/v1/jobs — submit a batch job (JSON or multipart with CSV) */
    public void submit(Context ctx) {
        // Atomic concurrency limit — increment first, decrement on reject
        if (activeJobs.incrementAndGet() > MAX_ACTIVE_JOBS) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.TOO_MANY_REQUESTS);
            ctx.header("Retry-After", "30");
            ctx.json(Map.of("error", "Server busy, retry later"));
            return;
        }

        String contentType = ctx.contentType() != null ? ctx.contentType() : "";

        if (contentType.contains("multipart/form-data")) {
            submitWithCsv(ctx);
        } else {
            submitJson(ctx);
        }
    }

    /** Submit a batch job from JSON body: { templateId, rowCount } */
    private void submitJson(Context ctx) {
        var body = ctx.bodyAsClass(Map.class);
        String templateId = (String) body.get("templateId");
        if (templateId == null || templateId.isBlank()) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "templateId is required"));
            return;
        }

        if (!templateId.matches("^[a-zA-Z0-9_-]{1,128}$")) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid templateId format"));
            return;
        }

        int rowCount = 1;
        Object rawCount = body.get("rowCount");
        if (rawCount instanceof Number n) {
            rowCount = Math.max(1, Math.min(n.intValue(), MAX_ROW_COUNT));
        }

        String jobId = "job-" + UUID.randomUUID();
        long now = System.currentTimeMillis();
        JobRecord record = new JobRecord(
            jobId, templateId, JobRecord.PENDING,
            rowCount, 0, 0, null, now, now, 0
        );
        jobRepo.save(record);

        int finalRowCount = rowCount;
        executor.submit(() -> {
            try {
                processor.run(jobId, templateId, finalRowCount);
            } finally {
                activeJobs.decrementAndGet();
            }
        });

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(Map.of(
            "jobId", jobId,
            "status", JobRecord.PENDING,
            "statusUrl", "/api/v1/jobs/" + jobId
        ));

        log.info("Submitted batch job {} for template {} ({} rows)", jobId, templateId, finalRowCount);
    }

    /** Submit a batch job with CSV data: multipart form with templateId + csv file */
    private void submitWithCsv(Context ctx) {
        String templateId = ctx.formParam("templateId");
        if (templateId == null || templateId.isBlank()) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "templateId is required"));
            return;
        }

        if (!templateId.matches("^[a-zA-Z0-9_-]{1,128}$")) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid templateId format"));
            return;
        }

        UploadedFile csvFile = ctx.uploadedFile("csv");
        if (csvFile == null) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "CSV file is required (field name: csv)"));
            return;
        }

        List<Map<String, String>> rows;
        try {
            String csvText = new String(csvFile.content().readAllBytes(), StandardCharsets.UTF_8);
            rows = CsvDataSource.parse(csvText);
        } catch (IllegalArgumentException e) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", e.getMessage()));
            return;
        } catch (IOException e) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Failed to read CSV file"));
            return;
        }

        if (rows.isEmpty()) {
            activeJobs.decrementAndGet();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "CSV contains no data rows"));
            return;
        }

        String jobId = "job-" + UUID.randomUUID();
        long now = System.currentTimeMillis();
        JobRecord record = new JobRecord(
            jobId, templateId, JobRecord.PENDING,
            rows.size(), 0, 0, null, now, now, 0
        );
        jobRepo.save(record);

        executor.submit(() -> {
            try {
                processor.runWithData(jobId, templateId, rows);
            } finally {
                activeJobs.decrementAndGet();
            }
        });

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(Map.of(
            "jobId", jobId,
            "status", JobRecord.PENDING,
            "statusUrl", "/api/v1/jobs/" + jobId,
            "totalRows", rows.size()
        ));

        log.info("Submitted CSV batch job {} for template {} ({} rows from CSV)",
            jobId, templateId, rows.size());
    }

    /** GET /api/v1/jobs — list all jobs */
    public void list(Context ctx) {
        ctx.json(jobRepo.listAll());
    }

    /** GET /api/v1/jobs/{id} — job status */
    public void status(Context ctx) {
        String jobId = RequestValidator.validateId(ctx);
        if (jobId == null) return;

        var job = jobRepo.findById(jobId);
        if (job.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Job not found"));
            return;
        }

        JobRecord record = job.get();
        ctx.json(record);

        // Hint polling interval for non-terminal jobs
        if (!record.isTerminal()) {
            ctx.header("Retry-After", "2");
        }
    }

    /** DELETE /api/v1/jobs/{id} — cancel a running job or delete a completed job */
    public void cancel(Context ctx) {
        String jobId = RequestValidator.validateId(ctx);
        if (jobId == null) return;

        var job = jobRepo.findById(jobId);
        if (job.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Job not found"));
            return;
        }

        if (job.get().isTerminal()) {
            // Terminal job: delete record and output files
            jobRepo.delete(jobId);
            ctx.json(Map.of("deleted", true, "jobId", jobId));
            return;
        }

        processor.requestCancel(jobId);
        ctx.json(Map.of("cancelled", true, "jobId", jobId));
    }

    /** GET /api/v1/jobs/{id}/output — download ZIP */
    public void download(Context ctx) {
        String jobId = RequestValidator.validateId(ctx);
        if (jobId == null) return;

        var job = jobRepo.findById(jobId);
        if (job.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Job not found"));
            return;
        }

        if (!JobRecord.COMPLETED.equals(job.get().status())) {
            ctx.status(HttpStatus.CONFLICT);
            ctx.json(Map.of("error", "Job not completed", "status", job.get().status()));
            return;
        }

        try {
            // Path containment check using normalize (does not require file to exist)
            Path zipPath = jobRepo.getOutputZipPath(jobId).normalize().toAbsolutePath();
            Path jobsBase = Path.of("data", "jobs").normalize().toAbsolutePath();
            if (!zipPath.startsWith(jobsBase)) {
                ctx.status(HttpStatus.FORBIDDEN);
                ctx.json(Map.of("error", "Access denied"));
                return;
            }

            if (!Files.exists(zipPath)) {
                ctx.status(HttpStatus.NOT_FOUND);
                ctx.json(Map.of("error", "Output file not found"));
                return;
            }

            ctx.contentType("application/zip");
            ctx.header("Content-Disposition", "attachment; filename=\"job-output.zip\"");
            ctx.header("Content-Length", String.valueOf(Files.size(zipPath)));
            ctx.result(Files.newInputStream(zipPath.toRealPath()));

        } catch (IOException e) {
            log.error("Failed to serve output for job {}", jobId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to serve output"));
        }
    }
}
