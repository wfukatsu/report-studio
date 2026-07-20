package com.report.server.job;

import com.report.server.CsvDataSource;
import com.report.server.RequestValidator;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import io.javalin.http.UploadedFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

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
    private final JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(MAX_ACTIVE_JOBS);

    public JobController(JobRepository jobRepo, BatchPdfProcessor processor, ExecutorService executor) {
        this.jobRepo = jobRepo;
        this.processor = processor;
        this.executor = executor;
    }

    /** POST /api/v1/jobs — submit a batch job (JSON or multipart with CSV) */
    public void submit(Context ctx) {
        // Unified admission control (issue #60) — slot released on reject or in the worker
        if (!limiter.tryAcquire()) {
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
            limiter.release();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "templateId is required"));
            return;
        }

        if (!templateId.matches("^[a-zA-Z0-9_-]{1,128}$")) {
            limiter.release();
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
                limiter.release();
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
            limiter.release();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "templateId is required"));
            return;
        }

        if (!templateId.matches("^[a-zA-Z0-9_-]{1,128}$")) {
            limiter.release();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid templateId format"));
            return;
        }

        UploadedFile csvFile = ctx.uploadedFile("csv");
        if (csvFile == null) {
            limiter.release();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "CSV file is required (field name: csv)"));
            return;
        }

        List<Map<String, String>> rows;
        try {
            String csvText = new String(csvFile.content().readAllBytes(), StandardCharsets.UTF_8);
            rows = CsvDataSource.parse(csvText);
        } catch (IllegalArgumentException e) {
            limiter.release();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", e.getMessage()));
            return;
        } catch (IOException e) {
            limiter.release();
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Failed to read CSV file"));
            return;
        }

        if (rows.isEmpty()) {
            limiter.release();
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
                limiter.release();
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

    /** GET /api/v1/jobs — list V1 batch jobs (V2 jobs share the store but not this API) */
    public void list(Context ctx) {
        ctx.json(jobRepo.listAll().stream().filter(JobRecord::isV1).toList());
    }

    // ── Unified V2 job API (issue #191) ─────────────────────────────────────────

    /**
     * GET /api/v2/pdf-jobs — unified listing of every job type (V1 CSV batch, V2
     * single-PDF, V2 batch-ZIP), newest first, projected to a stable DTO with the
     * lowercase status vocabulary. Owner-scoped: a user sees their own jobs plus
     * ownerless (legacy/anonymous) jobs; admins see everything.
     */
    public void listUnified(Context ctx) {
        Principal principal = ctx.attribute("principal");
        boolean admin = principal != null && principal.roles().contains("admin");
        String userId = principal != null ? principal.userId() : null;
        List<Map<String, Object>> out = jobRepo.listAll().stream()
                .filter(j -> j.owner() == null || admin || (userId != null && userId.equals(j.owner())))
                .map(JobController::toUnifiedDto)
                .toList();
        ctx.json(out);
    }

    /**
     * DELETE /api/v2/pdf-jobs/{jobId} — cancel or delete any job type (issue #191).
     * Terminal jobs are deleted (record + artifacts); running V1 jobs are cooperatively
     * cancelled via the processor; running V2 jobs are marked CANCELLED (best-effort —
     * the in-flight worker is not interrupted, but the job leaves the active list).
     */
    public void cancelUnified(Context ctx) {
        String jobId = ctx.pathParam("jobId");
        var jobOpt = jobRepo.findById(jobId);
        if (jobOpt.isEmpty() || !canAccess(ctx, jobOpt.get())) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Job not found"));
            return;
        }
        JobRecord job = jobOpt.get();
        if (job.isTerminal()) {
            jobRepo.delete(jobId);
            ctx.json(Map.of("deleted", true, "jobId", jobId));
            return;
        }
        if (job.isV1()) {
            processor.requestCancel(jobId);
        } else {
            jobRepo.save(job.withStatus(JobStatus.CANCELLED));
        }
        ctx.json(Map.of("cancelled", true, "jobId", jobId));
    }

    /**
     * Owner-scoped access: ownerless jobs are open; otherwise owner or admin only.
     * Public so sibling job stacks (e.g. {@code BatchPdfController} in the parent package)
     * apply the identical rule instead of re-implementing it (issue #199).
     */
    public static boolean canAccess(Context ctx, JobRecord job) {
        if (job.owner() == null) return true;
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) return false;
        return job.owner().equals(principal.userId()) || principal.roles().contains("admin");
    }

    private static Map<String, Object> toUnifiedDto(JobRecord j) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId", j.jobId());
        m.put("jobType", j.jobType() != null ? j.jobType() : JobRecord.TYPE_V1_BATCH);
        m.put("status", j.statusEnum().v2Name());
        m.put("templateId", j.templateId());
        m.put("total", j.totalItems());
        m.put("completed", j.processedItems());
        m.put("failed", j.failedItems());
        if (j.errorMessage() != null) m.put("error", j.errorMessage());
        m.put("createdAt", j.createdAt());
        m.put("updatedAt", j.updatedAt());
        m.put("completedAt", j.completedAt());
        return m;
    }

    /** GET /api/v1/jobs/{id} — job status */
    public void status(Context ctx) {
        String jobId = RequestValidator.validateId(ctx);
        if (jobId == null) return;

        var job = jobRepo.findById(jobId).filter(JobRecord::isV1);
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

        var job = jobRepo.findById(jobId).filter(JobRecord::isV1);
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

        var job = jobRepo.findById(jobId).filter(JobRecord::isV1);
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
            // Path containment check using normalize (does not require file to exist).
            // The base is the startup-resolved absolute jobs root, not the current
            // working directory (issue #58)
            Path zipPath = jobRepo.getOutputZipPath(jobId).normalize().toAbsolutePath();
            Path jobsBase = JobRepository.jobsRoot();
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
