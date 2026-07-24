package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.job.BatchPdfOrchestrator;
import com.report.server.job.JobController;
import com.report.server.job.JobRecord;
import com.report.server.job.JobStatus;
import com.report.server.job.JobStore;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Batch PDF generation for multiple form responses.
 *
 * <ul>
 *   <li>POST /api/v2/pdf-jobs/batch — submit batch; returns 202
 *   <li>GET /api/v2/pdf-jobs/batch/{id} — poll status
 *   <li>GET /api/v2/pdf-jobs/batch/{id}/result — download ZIP
 * </ul>
 *
 * <p>HTTP layer only (issue #420): request validation, job admission/submission, status reads, and
 * result download. Coordinator threading, PDF rendering, ZIP assembly, and filename templating live
 * in {@link BatchPdfOrchestrator} (package {@code job}). The V2 API keeps its historical response
 * shape and lowercase status vocabulary.
 */
public final class BatchPdfController {

    private static final Logger log = LoggerFactory.getLogger(BatchPdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static final int MAX_BATCH_SIZE = 50;
    static final long TTL_SECONDS = 300;

    private final JsonBlobRepository definitionsRepo;
    private final JobStore jobStore;
    private final BatchPdfOrchestrator orchestrator;

    public BatchPdfController(
            JsonBlobRepository definitionsRepo,
            JobStore jobStore,
            BatchPdfOrchestrator orchestrator) {
        this.definitionsRepo = definitionsRepo;
        this.jobStore = jobStore;
        this.orchestrator = orchestrator;
    }

    // ── POST /api/v2/pdf-jobs/batch ───────────────────────────────────────────

    public void submitBatch(Context ctx) throws Exception {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ApiError.respond(
                    ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
            return;
        }

        JsonNode req;
        try {
            req = MAPPER.readTree(ctx.body());
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        String templateId = req.path("templateId").asText(null);
        if (templateId == null || templateId.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "templateId is required");
            return;
        }

        // Two input modes (issue #193): stored form responses (responseIds) OR inline
        // data rows (rows) for DB-row-driven bulk export. Exactly one must be present.
        JsonNode idsNode = req.path("responseIds");
        JsonNode rowsNode = req.path("rows");
        boolean hasIds = idsNode.isArray() && idsNode.size() > 0;
        boolean hasRows = rowsNode.isArray() && rowsNode.size() > 0;
        if (hasIds == hasRows) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Provide exactly one of a non-empty responseIds or rows array");
            return;
        }
        int inputSize = hasIds ? idsNode.size() : rowsNode.size();
        if (inputSize > MAX_BATCH_SIZE) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Maximum batch size is " + MAX_BATCH_SIZE);
            return;
        }

        // Optional output filename template (issue #194), e.g. "{documentNo}_{customer.name}.pdf"
        String filenameTemplate = req.path("filenameTemplate").asText(null);
        if (filenameTemplate != null && filenameTemplate.isBlank()) filenameTemplate = null;

        // Build the input list for either mode.
        List<BatchPdfOrchestrator.BatchInput> inputs = new ArrayList<>();
        if (hasIds) {
            for (JsonNode id : idsNode) {
                if (id.isTextual() && !id.asText().isBlank())
                    inputs.add(new BatchPdfOrchestrator.BatchInput(id.asText(), null));
            }
        } else {
            for (JsonNode row : rowsNode) {
                if (row.isObject()) inputs.add(new BatchPdfOrchestrator.BatchInput(null, row));
            }
        }
        if (inputs.isEmpty()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "No valid items to render");
            return;
        }

        // Ensure template exists
        Optional<String> rawOpt = definitionsRepo.get(templateId);
        if (rawOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }

        // Admission control (issue #60) — previously this stack had no cap
        if (!orchestrator.tryAcquire()) {
            ctx.header("Retry-After", "5");
            ApiError.respond(
                    ctx,
                    HttpStatus.TOO_MANY_REQUESTS,
                    "RATE_LIMITED",
                    "Too many concurrent batch jobs; retry shortly");
            return;
        }

        String batchJobId = "batch-" + UUID.randomUUID();
        JobRecord job =
                JobRecord.create(
                        batchJobId,
                        templateId,
                        JobRecord.TYPE_V2_BATCH,
                        principal.userId(),
                        inputs.size(),
                        System.currentTimeMillis() + TTL_SECONDS * 1000);
        jobStore.save(job);

        orchestrator.submit(
                job, templateId, rawOpt.get(), inputs, filenameTemplate, principal.userId());

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(
                Map.of(
                        "batchJobId",
                        batchJobId,
                        "totalCount",
                        inputs.size(),
                        "status",
                        JobStatus.PENDING.v2Name(),
                        "statusUrl",
                        "/api/v2/pdf-jobs/batch/" + batchJobId));
    }

    // ── GET /api/v2/pdf-jobs/batch/{id} ──────────────────────────────────────

    public void getStatus(Context ctx) {
        String id = ctx.pathParam("id");
        JobRecord job = findBatchJob(id).orElse(null);
        // Owner-scoped: reject (as 404, to avoid job-ID enumeration) jobs the caller does not
        // own. Previously any authenticated user who knew a job ID could read another user's
        // batch status (issue #199). Mirrors PdfJobController / JobController.
        if (job == null || !JobController.canAccess(ctx, job)) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Batch job not found");
            return;
        }
        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("batchJobId", job.jobId());
        resp.put("status", job.statusEnum().v2Name());
        resp.put("total", job.totalItems());
        resp.put("completed", job.processedItems());
        resp.put("failed", job.failedItems());
        if (job.errorMessage() != null) resp.put("error", job.errorMessage());
        ctx.json(resp);
        if (!job.isTerminal()) ctx.header("Retry-After", "2");
    }

    // ── GET /api/v2/pdf-jobs/batch/{id}/result ────────────────────────────────

    public void getResult(Context ctx) {
        String id = ctx.pathParam("id");
        JobRecord job = findBatchJob(id).orElse(null);
        // Owner-scoped: a non-owner must not download (and, via the one-shot delete below,
        // destroy) another user's result ZIP (issue #199). 404 to avoid job-ID enumeration.
        if (job == null || !JobController.canAccess(ctx, job)) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Batch job not found");
            return;
        }
        if (job.statusEnum() != JobStatus.COMPLETED) {
            ApiError.respond(
                    ctx,
                    HttpStatus.CONFLICT,
                    "CONFLICT",
                    "Job not completed",
                    Map.of("status", job.statusEnum().v2Name()));
            return;
        }
        Path zipPath = job.artifactPath() != null ? Path.of(job.artifactPath()) : null;
        if (zipPath == null || !Files.exists(zipPath)) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "ZIP result unavailable");
            return;
        }
        // Stream the ZIP straight from disk instead of loading up to MAX_ZIP_BYTES (100 MB)
        // onto the heap (#210). The one-shot delete is deferred to stream close() so the
        // record/artifacts are dropped only after the download has been fully written.
        final String jobId = job.jobId();
        try {
            java.io.InputStream fileStream = Files.newInputStream(zipPath);
            ctx.contentType("application/zip");
            ctx.header("Content-Disposition", "attachment; filename=\"batch-" + id + ".zip\"");
            ctx.header("Content-Length", String.valueOf(Files.size(zipPath)));
            ctx.result(
                    new java.io.FilterInputStream(fileStream) {
                        @Override
                        public void close() throws java.io.IOException {
                            try {
                                super.close();
                            } finally {
                                // One-shot download: drop the record and its artifacts after
                                // streaming.
                                try {
                                    jobStore.delete(jobId);
                                } catch (Exception e) {
                                    log.warn(
                                            "Failed to clean up batch job {}: {}",
                                            jobId,
                                            e.getMessage());
                                }
                            }
                        }
                    });
        } catch (java.io.IOException e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "ZIP result unavailable");
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Optional<JobRecord> findBatchJob(String id) {
        return jobStore.findById(id).filter(j -> JobRecord.TYPE_V2_BATCH.equals(j.jobType()));
    }
}
