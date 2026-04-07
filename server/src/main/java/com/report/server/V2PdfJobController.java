package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Async PDF generation jobs for V2 templates.
 *
 * <ul>
 *   <li>{@code POST /api/v2/pdf-jobs}              — submit; returns 202 + jobId</li>
 *   <li>{@code GET  /api/v2/pdf-jobs/{jobId}}       — poll status</li>
 *   <li>{@code GET  /api/v2/pdf-jobs/{jobId}/result} — download PDF (completed only)</li>
 * </ul>
 *
 * <p>Jobs live in-memory. After TTL_SECONDS they are eligible for eviction on the
 * next submit call (lazy eviction — no separate cleanup thread needed).
 */
public final class V2PdfJobController {

    private static final Logger log = LoggerFactory.getLogger(V2PdfJobController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static final String STATUS_PENDING    = "pending";
    static final String STATUS_PROCESSING = "processing";
    static final String STATUS_COMPLETED  = "completed";
    static final String STATUS_FAILED     = "failed";

    /** Jobs older than this are evicted on the next submit. */
    private static final long TTL_SECONDS = 300; // 5 minutes
    /** Maximum concurrent in-flight PDF jobs. */
    private static final int MAX_ACTIVE_JOBS = 10;
    /** PDF generation timeout. */
    private static final long TIMEOUT_SECONDS = 30;

    private final JsonBlobRepository definitionsRepo;
    private final ExecutorService pdfExecutor;

    /** In-memory job registry. */
    private final ConcurrentHashMap<String, PdfJobRecord> jobs = new ConcurrentHashMap<>();
    private final AtomicInteger activeJobs = new AtomicInteger(0);

    public V2PdfJobController(JsonBlobRepository definitionsRepo, ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.pdfExecutor = pdfExecutor;
    }

    // ---------------------------------------------------------------------------
    // POST /api/v2/pdf-jobs
    // ---------------------------------------------------------------------------

    public void submit(Context ctx) {
        evictExpired();

        if (activeJobs.get() >= MAX_ACTIVE_JOBS) {
            ctx.status(HttpStatus.TOO_MANY_REQUESTS);
            ctx.header("Retry-After", "5");
            ctx.json(Map.of("error", "Too many concurrent PDF jobs; retry shortly"));
            return;
        }

        String body = ctx.body();
        if (body.length() > 512_000) {
            ctx.status(413);
            ctx.json(Map.of("error", "Request body too large"));
            return;
        }
        if (!RequestValidator.validateJson(ctx, body)) return;

        String templateId;
        ObjectNode testDataNode;
        String variantId;
        try {
            JsonNode root = MAPPER.readTree(body);
            JsonNode tidNode = root.get("templateId");
            if (tidNode == null || !tidNode.isTextual()) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "templateId is required"));
                return;
            }
            templateId = tidNode.asText().trim();
            if (templateId.isEmpty()) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "templateId is required"));
                return;
            }

            JsonNode tdNode = root.get("testData");
            testDataNode = (tdNode != null && tdNode.isObject())
                    ? (ObjectNode) tdNode
                    : MAPPER.createObjectNode();

            JsonNode varNode = root.get("variantId");
            variantId = (varNode != null && varNode.isTextual()) ? varNode.asText() : null;

        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON body"));
            return;
        }

        // Ensure template exists
        Optional<String> rawOpt = definitionsRepo.get(templateId);
        if (rawOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }
        String raw = rawOpt.get();

        // Create job
        String jobId = "pjob-" + UUID.randomUUID();
        long now = Instant.now().getEpochSecond();
        PdfJobRecord job = new PdfJobRecord(jobId, templateId, STATUS_PENDING, null, null, now);
        jobs.put(jobId, job);
        activeJobs.incrementAndGet();

        // Capture for lambda
        final String finalTemplateId = templateId;
        final ObjectNode finalTestData = testDataNode;
        final String finalVariantId = variantId;
        final String finalRaw = raw;

        pdfExecutor.submit(() -> {
            jobs.put(jobId, job.withStatus(STATUS_PROCESSING));
            try {
                JsonNode definitionNode = MAPPER.readTree(finalRaw);
                // V2ProjectionBuilder.build returns a projection JSON String
                String projectionJson = V2ProjectionBuilder.build(
                        finalTemplateId, definitionNode, finalTestData, finalVariantId);

                // PdfRenderer.render takes the projection JSON String
                final String finalProjectionJson = projectionJson;
                byte[] pdfBytes = java.util.concurrent.CompletableFuture
                        .supplyAsync(() -> {
                            try {
                                return PdfRenderer.render(finalProjectionJson);
                            } catch (Exception ex) {
                                throw new RuntimeException(ex);
                            }
                        }, pdfExecutor)
                        .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

                jobs.put(jobId, job.withCompleted(pdfBytes));
                log.info("Async PDF job {} completed ({} bytes)", jobId, pdfBytes.length);
            } catch (java.util.concurrent.TimeoutException e) {
                jobs.put(jobId, job.withFailed("PDF generation timed out (30s)"));
                log.warn("Async PDF job {} timed out", jobId);
            } catch (Exception e) {
                jobs.put(jobId, job.withFailed("PDF generation failed: " + e.getMessage()));
                log.error("Async PDF job {} failed", jobId, e);
            } finally {
                activeJobs.decrementAndGet();
            }
        });

        Principal principal = ctx.attribute("principal");
        log.info("Submitted async PDF job {} for template {} (user={})",
                jobId, templateId, principal != null ? principal.userId() : "anonymous");

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(Map.of(
                "jobId", jobId,
                "status", STATUS_PENDING,
                "statusUrl", "/api/v2/pdf-jobs/" + jobId,
                "resultUrl", "/api/v2/pdf-jobs/" + jobId + "/result"
        ));
    }

    // ---------------------------------------------------------------------------
    // GET /api/v2/pdf-jobs/{jobId}
    // ---------------------------------------------------------------------------

    public void getStatus(Context ctx) {
        String jobId = ctx.pathParam("jobId");
        PdfJobRecord job = jobs.get(jobId);
        if (job == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Job not found"));
            return;
        }

        Map<String, Object> response = job.error() != null
                ? Map.of("jobId", job.jobId(), "status", job.status(), "error", job.error())
                : Map.of("jobId", job.jobId(), "status", job.status());

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
        PdfJobRecord job = jobs.get(jobId);
        if (job == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Job not found"));
            return;
        }
        if (!STATUS_COMPLETED.equals(job.status())) {
            ctx.status(HttpStatus.CONFLICT);
            ctx.json(Map.of("error", "Job not completed", "status", job.status()));
            return;
        }

        byte[] pdfBytes = job.pdfBytes();
        if (pdfBytes == null) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "PDF result unavailable"));
            return;
        }

        ctx.contentType("application/pdf");
        ctx.header("Content-Disposition",
                "attachment; filename=\"template-" + job.templateId() + ".pdf\"");
        ctx.header("Content-Length", String.valueOf(pdfBytes.length));
        ctx.result(pdfBytes);

        // Remove from memory after download to free resources
        jobs.remove(jobId);
    }

    // ---------------------------------------------------------------------------
    // Lazy eviction of expired jobs
    // ---------------------------------------------------------------------------

    private void evictExpired() {
        long cutoff = Instant.now().getEpochSecond() - TTL_SECONDS;
        jobs.entrySet().removeIf(e -> e.getValue().createdAt() < cutoff);
    }

    // ---------------------------------------------------------------------------
    // Expose for testing
    // ---------------------------------------------------------------------------

    Optional<PdfJobRecord> findJob(String jobId) {
        return Optional.ofNullable(jobs.get(jobId));
    }

    // ---------------------------------------------------------------------------
    // Job record — immutable value
    // ---------------------------------------------------------------------------

    record PdfJobRecord(
            String jobId,
            String templateId,
            String status,
            byte[] pdfBytes,
            String error,
            long createdAt
    ) {
        boolean isTerminal() {
            return STATUS_COMPLETED.equals(status) || STATUS_FAILED.equals(status);
        }

        PdfJobRecord withStatus(String newStatus) {
            return new PdfJobRecord(jobId, templateId, newStatus, null, null, createdAt);
        }

        PdfJobRecord withCompleted(byte[] bytes) {
            return new PdfJobRecord(jobId, templateId, STATUS_COMPLETED, bytes, null, createdAt);
        }

        PdfJobRecord withFailed(String msg) {
            return new PdfJobRecord(jobId, templateId, STATUS_FAILED, null, msg, createdAt);
        }
    }
}
