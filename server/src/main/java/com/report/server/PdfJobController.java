package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.job.JobConcurrencyLimiter;
import com.report.server.job.JobRecord;
import com.report.server.job.JobStatus;
import com.report.server.job.JobStore;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Async PDF generation jobs for V2 templates.
 *
 * <ul>
 *   <li>{@code POST /api/v2/pdf-jobs} — submit; returns 202 + jobId
 *   <li>{@code GET /api/v2/pdf-jobs/{jobId}} — poll status
 *   <li>{@code GET /api/v2/pdf-jobs/{jobId}/result} — download PDF (completed only)
 * </ul>
 *
 * <p>Jobs run on the unified job abstraction (issue #60): metadata is persisted via {@link
 * JobStore} (ScalarDB in production), the result PDF lands under {@code
 * data/jobs/{jobId}/output.pdf}, TTL reclamation is handled by the shared reaper, and server
 * restarts reconcile in-flight jobs to FAILED like every other job type. The V2 API keeps its
 * historical lowercase status vocabulary as a compatibility layer.
 */
public final class PdfJobController {

    private static final Logger log = LoggerFactory.getLogger(PdfJobController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Jobs expire this long after submission (reaped by JobTtlReaper). */
    static final long TTL_SECONDS = 300; // 5 minutes

    /** Maximum concurrent in-flight PDF jobs. */
    private static final int MAX_ACTIVE_JOBS = 10;

    /** PDF generation timeout. */
    private static final long TIMEOUT_SECONDS = 30;

    private final JsonBlobRepository definitionsRepo;
    private final JobStore jobStore;
    private final ExecutorService pdfExecutor;
    private final JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(MAX_ACTIVE_JOBS);

    public PdfJobController(
            JsonBlobRepository definitionsRepo, JobStore jobStore, ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.jobStore = jobStore;
        this.pdfExecutor = pdfExecutor;
    }

    // ---------------------------------------------------------------------------
    // POST /api/v2/pdf-jobs
    // ---------------------------------------------------------------------------

    public void submit(Context ctx) {
        if (!limiter.tryAcquire()) {
            ctx.header("Retry-After", "5");
            ApiError.respond(
                    ctx,
                    HttpStatus.TOO_MANY_REQUESTS,
                    "RATE_LIMITED",
                    "Too many concurrent PDF jobs; retry shortly");
            return;
        }
        boolean handedOff = false;
        try {
            handedOff = doSubmit(ctx);
        } finally {
            if (!handedOff) limiter.release();
        }
    }

    /**
     * @return true when the job was handed to the executor (slot released by the worker).
     */
    private boolean doSubmit(Context ctx) {
        String body = ctx.body();
        if (body.length() > 512_000) {
            ApiError.respond(ctx, 413, "PAYLOAD_TOO_LARGE", "Request body too large");
            return false;
        }
        if (!RequestValidator.validateJson(ctx, body)) return false;

        String templateId;
        ObjectNode testDataNode;
        String variantId;
        try {
            JsonNode root = MAPPER.readTree(body);
            JsonNode tidNode = root.get("templateId");
            if (tidNode == null || !tidNode.isTextual() || tidNode.asText().trim().isEmpty()) {
                ApiError.respond(
                        ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "templateId is required");
                return false;
            }
            templateId = tidNode.asText().trim();

            JsonNode tdNode = root.get("testData");
            testDataNode =
                    (tdNode != null && tdNode.isObject())
                            ? (ObjectNode) tdNode
                            : MAPPER.createObjectNode();

            JsonNode varNode = root.get("variantId");
            variantId = (varNode != null && varNode.isTextual()) ? varNode.asText() : null;

        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON body");
            return false;
        }

        // Ensure template exists
        Optional<String> rawOpt = definitionsRepo.get(templateId);
        if (rawOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return false;
        }
        String raw = rawOpt.get();

        // Create job — remember the submitting principal for access control (issue #58)
        Principal submitter = ctx.attribute("principal");
        String owner = submitter != null && !submitter.isAnonymous() ? submitter.userId() : null;
        String jobId = "pjob-" + UUID.randomUUID();
        JobRecord job =
                JobRecord.create(
                        jobId,
                        templateId,
                        JobRecord.TYPE_V2_PDF,
                        owner,
                        1,
                        System.currentTimeMillis() + TTL_SECONDS * 1000);
        jobStore.save(job);

        final String finalRaw = raw;
        final ObjectNode finalTestData = testDataNode;
        final String finalVariantId = variantId;

        pdfExecutor.submit(
                () -> {
                    jobStore.save(job.withStatus(JobStatus.PROCESSING));
                    try {
                        // Unwrap the stored envelope {definition:{pages,...}} — renderDefinition
                        // reads `pages` from the root, so passing the whole envelope renders a
                        // blank page (#153). Fall back to the node itself for bare-definition
                        // blobs.
                        JsonNode envelope = MAPPER.readTree(finalRaw);
                        JsonNode definitionNode =
                                envelope.has("definition") ? envelope.path("definition") : envelope;
                        // Prepare the V2 definition for native rendering (issue #52)
                        final String definitionJson =
                                V2RenderSupport.prepare(
                                        definitionNode, finalTestData, finalVariantId);

                        byte[] pdfBytes =
                                java.util.concurrent.CompletableFuture.supplyAsync(
                                                () -> {
                                                    try {
                                                        return PdfRenderer.renderDefinition(
                                                                definitionJson);
                                                    } catch (Exception ex) {
                                                        throw new RuntimeException(ex);
                                                    }
                                                },
                                                pdfExecutor)
                                        .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

                        // Result lands under the job's artifact dir (off-heap, restart-safe)
                        Path resultFile = jobStore.jobDir(jobId).resolve("output.pdf");
                        Files.createDirectories(resultFile.getParent());
                        Files.write(resultFile, pdfBytes);
                        jobStore.save(job.withProgress(1, 0).withArtifact(resultFile.toString()));
                        log.info("Async PDF job {} completed ({} bytes)", jobId, pdfBytes.length);
                    } catch (java.util.concurrent.TimeoutException e) {
                        jobStore.save(job.withError("PDF generation timed out (30s)"));
                        log.warn("Async PDF job {} timed out", jobId);
                    } catch (Exception e) {
                        // Generic client-facing message — the exception detail stays in the log
                        // (issue #58)
                        jobStore.save(job.withError("PDF generation failed"));
                        log.error("Async PDF job {} failed", jobId, e);
                    } finally {
                        limiter.release();
                    }
                });

        log.info(
                "Submitted async PDF job {} for template {} (user={})",
                jobId,
                templateId,
                owner != null ? owner : "anonymous");

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(
                Map.of(
                        "jobId",
                        jobId,
                        "status",
                        JobStatus.PENDING.v2Name(),
                        "statusUrl",
                        "/api/v2/pdf-jobs/" + jobId,
                        "resultUrl",
                        "/api/v2/pdf-jobs/" + jobId + "/result"));
        return true;
    }

    // ---------------------------------------------------------------------------
    // GET /api/v2/pdf-jobs/{jobId}
    // ---------------------------------------------------------------------------

    public void getStatus(Context ctx) {
        String jobId = ctx.pathParam("jobId");
        JobRecord job = findV2Job(jobId).orElse(null);
        if (job == null || !canAccess(ctx, job)) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Job not found");
            return;
        }

        Map<String, Object> response = new HashMap<>();
        response.put("jobId", job.jobId());
        response.put("status", job.statusEnum().v2Name());
        if (job.errorMessage() != null) response.put("error", job.errorMessage());
        ctx.json(response);

        // Hint polling interval for non-terminal jobs
        if (!job.isTerminal()) {
            ctx.header("Retry-After", "2");
        }
    }

    // ---------------------------------------------------------------------------
    // GET /api/v2/pdf-jobs/{jobId}/result
    // ---------------------------------------------------------------------------

    public void getResult(Context ctx) {
        String jobId = ctx.pathParam("jobId");
        JobRecord job = findV2Job(jobId).orElse(null);
        if (job == null || !canAccess(ctx, job)) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Job not found");
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

        Path resultFile = job.artifactPath() != null ? Path.of(job.artifactPath()) : null;
        if (resultFile == null || !Files.exists(resultFile)) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "PDF result unavailable");
            return;
        }

        byte[] pdfBytes;
        try {
            pdfBytes = Files.readAllBytes(resultFile);
        } catch (java.io.IOException e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "PDF result unavailable");
            return;
        }

        ctx.contentType("application/pdf");
        ctx.header(
                "Content-Disposition",
                "attachment; filename=\"template-" + job.templateId() + ".pdf\"");
        ctx.header("Content-Length", String.valueOf(pdfBytes.length));
        ctx.result(pdfBytes);

        // One-shot download: drop the record and its artifacts
        jobStore.delete(job.jobId());
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private Optional<JobRecord> findV2Job(String jobId) {
        return jobStore.findById(jobId).filter(j -> JobRecord.TYPE_V2_PDF.equals(j.jobType()));
    }

    /** Exposed for testing. */
    Optional<JobRecord> findJob(String jobId) {
        return findV2Job(jobId);
    }

    /**
     * Ownership check (issue #58): a job submitted by an authenticated user is visible only to that
     * user (or an admin). Jobs submitted anonymously (auth disabled) remain accessible as before.
     * 404 — not 403 — so job IDs cannot be probed for existence.
     */
    static boolean canAccess(Context ctx, JobRecord job) {
        if (job.owner() == null) return true;
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) return false;
        return job.owner().equals(principal.userId()) || principal.roles().contains("admin");
    }
}
