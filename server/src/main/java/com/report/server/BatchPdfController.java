package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.job.JobConcurrencyLimiter;
import com.report.server.job.JobRecord;
import com.report.server.job.JobStatus;
import com.report.server.job.JobStore;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Batch PDF generation for multiple form responses.
 *
 * <ul>
 *   <li>POST /api/v2/pdf-jobs/batch        — submit batch; returns 202</li>
 *   <li>GET  /api/v2/pdf-jobs/batch/{id}   — poll status</li>
 *   <li>GET  /api/v2/pdf-jobs/batch/{id}/result — download ZIP</li>
 * </ul>
 *
 * <p>Runs on the unified job abstraction (issue #60): metadata persisted via
 * {@link JobStore}, the result ZIP streamed to {@code data/jobs/{id}/output.zip}
 * (previously held on-heap as a byte array), TTL reaped by the shared reaper,
 * restart-reconciled like every other job type, and admission-capped by the
 * shared limiter (previously unbounded). The V2 API keeps its historical
 * response shape and lowercase status vocabulary.
 *
 * <p>Generates PDFs in parallel using the shared pdfExecutor (max 4 threads).
 * Partial failures produce a ZIP of successful PDFs + summary.json.
 * All-fail → failed job with no ZIP.
 */
public final class BatchPdfController {

    private static final Logger log = LoggerFactory.getLogger(BatchPdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static final int MAX_BATCH_SIZE = 50;
    static final long MAX_ZIP_BYTES = 100L * 1024 * 1024; // 100 MB
    static final long BATCH_TIMEOUT_SECONDS = 300; // 5 minutes
    static final long TTL_SECONDS = 300;
    private static final int MAX_ACTIVE_JOBS = 10;

    private final JsonBlobRepository definitionsRepo;
    private final JsonBlobRepository responseRepo;
    private final JobStore jobStore;
    private final ExecutorService pdfExecutor;
    private final JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(MAX_ACTIVE_JOBS);

    public BatchPdfController(JsonBlobRepository definitionsRepo,
                                 JsonBlobRepository responseRepo,
                                 JobStore jobStore,
                                 ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.responseRepo = responseRepo;
        this.jobStore = jobStore;
        this.pdfExecutor = pdfExecutor;
    }

    // ── POST /api/v2/pdf-jobs/batch ───────────────────────────────────────────

    public void submitBatch(Context ctx) throws Exception {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            ctx.json(Map.of("error", "Authentication required"));
            return;
        }

        JsonNode req;
        try { req = MAPPER.readTree(ctx.body()); }
        catch (Exception e) { ctx.status(HttpStatus.BAD_REQUEST); ctx.json(Map.of("error", "Invalid JSON")); return; }

        String templateId = req.path("templateId").asText(null);
        if (templateId == null || templateId.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "templateId is required"));
            return;
        }

        JsonNode idsNode = req.path("responseIds");
        if (!idsNode.isArray() || idsNode.size() == 0) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "responseIds must be a non-empty array"));
            return;
        }
        if (idsNode.size() > MAX_BATCH_SIZE) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Maximum batch size is " + MAX_BATCH_SIZE));
            return;
        }

        // Collect responseIds
        List<String> responseIds = new ArrayList<>();
        for (JsonNode id : idsNode) {
            if (id.isTextual() && !id.asText().isBlank()) responseIds.add(id.asText());
        }

        // Ensure template exists
        Optional<String> rawOpt = definitionsRepo.get(templateId);
        if (rawOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        // Admission control (issue #60) — previously this stack had no cap
        if (!limiter.tryAcquire()) {
            ctx.status(HttpStatus.TOO_MANY_REQUESTS);
            ctx.header("Retry-After", "5");
            ctx.json(Map.of("error", "Too many concurrent batch jobs; retry shortly"));
            return;
        }

        String batchJobId = "batch-" + UUID.randomUUID();
        JobRecord job = JobRecord.create(batchJobId, templateId, JobRecord.TYPE_V2_BATCH,
                principal.userId(), responseIds.size(),
                System.currentTimeMillis() + TTL_SECONDS * 1000);
        jobStore.save(job);

        final String finalTemplateId = templateId;
        final String finalRaw = rawOpt.get();
        final List<String> finalIds = responseIds;
        final String userId = principal.userId();

        CompletableFuture.runAsync(() -> {
            jobStore.save(job.withStatus(JobStatus.PROCESSING));
            try {
                Path zipPath = generateBatchZip(batchJobId, finalTemplateId, finalRaw, finalIds, userId);
                JobRecord latest = jobStore.findById(batchJobId).orElse(job);
                jobStore.save(latest.withArtifact(zipPath.toString()));
                log.info("Batch PDF job {} completed ({})", batchJobId, zipPath);
            } catch (Exception e) {
                JobRecord latest = jobStore.findById(batchJobId).orElse(job);
                jobStore.save(latest.withError(e.getMessage()));
                log.error("Batch PDF job {} failed", batchJobId, e);
            } finally {
                limiter.release();
            }
        }, pdfExecutor);

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(Map.of(
            "batchJobId", batchJobId,
            "totalCount", responseIds.size(),
            "status", JobStatus.PENDING.v2Name(),
            "statusUrl", "/api/v2/pdf-jobs/batch/" + batchJobId
        ));
    }

    /** Renders each response and streams the resulting ZIP to the job's artifact path. */
    private Path generateBatchZip(String batchJobId, String templateId, String rawDef,
                                  List<String> responseIds, String userId) throws Exception {
        // The stored blob is an envelope {created_by, definition:{pages,...}, ...}.
        // renderDefinition expects the inner ReportDefinition (it reads `pages`
        // from the root), so unwrap `.definition` — passing the whole envelope
        // renders a single blank page (~534B) and the job still reports success
        // (#153). Fall back to the node itself for bare-definition blobs.
        JsonNode envelope = MAPPER.readTree(rawDef);
        JsonNode definitionNode = envelope.has("definition") ? envelope.path("definition") : envelope;
        String dateStr = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(java.time.ZoneOffset.UTC)
                .format(Instant.now());

        AtomicInteger completedCount = new AtomicInteger();
        AtomicInteger failedCount = new AtomicInteger();

        List<CompletableFuture<PdfResult>> futures = new ArrayList<>();
        int[] seqArr = {0};

        for (String responseId : responseIds) {
            int seq = ++seqArr[0];
            String seqStr = String.format("%03d", seq);
            final String filename = seqStr + "_" + dateStr + ".pdf";

            // Fetch response data
            Optional<String> respOpt;
            try { respOpt = responseRepo.get(responseId); }
            catch (Exception e) {
                failedCount.incrementAndGet();
                futures.add(CompletableFuture.completedFuture(
                    new PdfResult(responseId, filename, null, "Response not found: " + responseId)));
                continue;
            }
            if (respOpt.isEmpty()) {
                failedCount.incrementAndGet();
                futures.add(CompletableFuture.completedFuture(
                    new PdfResult(responseId, filename, null, "Response not found")));
                continue;
            }

            final String respJson = respOpt.get();
            final JsonNode defNode = definitionNode;

            CompletableFuture<PdfResult> future = CompletableFuture.supplyAsync(() -> {
                try {
                    JsonNode resp = MAPPER.readTree(respJson);
                    ObjectNode testData = (ObjectNode) resp.path("data");
                    if (testData == null || testData.isMissingNode()) {
                        testData = MAPPER.createObjectNode();
                    }
                    String defJson = V2RenderSupport.prepare(defNode, testData, null);
                    byte[] pdfBytes = PdfRenderer.renderDefinition(defJson);
                    checkpointProgress(batchJobId, completedCount.incrementAndGet(), failedCount.get());
                    return new PdfResult(responseId, filename, pdfBytes, null);
                } catch (Exception ex) {
                    checkpointProgress(batchJobId, completedCount.get(), failedCount.incrementAndGet());
                    return new PdfResult(responseId, filename, null, ex.getMessage());
                }
            }, pdfExecutor);
            futures.add(future);
        }

        // Wait for all (with timeout)
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .get(BATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        List<PdfResult> results = futures.stream()
                .map(f -> f.getNow(null))
                .filter(Objects::nonNull)
                .toList();

        long successCount = results.stream().filter(r -> r.bytes() != null).count();
        long failCount = results.stream().filter(r -> r.bytes() == null).count();

        if (successCount == 0) {
            throw new RuntimeException("All PDF generations failed");
        }

        // Stream the ZIP to the job's artifact path (off-heap, issue #60)
        Path zipPath = jobStore.getOutputZipPath(batchJobId);
        Files.createDirectories(zipPath.getParent());
        long bytesWritten = 0;
        boolean truncated = false;

        try (ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(
                Files.newOutputStream(zipPath), 64 * 1024))) {
            for (PdfResult result : results) {
                if (result.bytes() == null) continue;
                long entrySize = result.bytes().length;
                if (bytesWritten + entrySize > MAX_ZIP_BYTES) {
                    // Add truncation notice
                    ZipEntry notice = new ZipEntry("_TRUNCATED.txt");
                    zos.putNextEntry(notice);
                    zos.write("ZIP size limit (100MB) reached. Some PDFs were omitted.".getBytes());
                    zos.closeEntry();
                    truncated = true;
                    break;
                }
                ZipEntry entry = new ZipEntry(result.filename());
                zos.putNextEntry(entry);
                zos.write(result.bytes());
                zos.closeEntry();
                bytesWritten += entrySize;
            }

            // summary.json
            ObjectNode summary = MAPPER.createObjectNode();
            summary.put("completed", successCount);
            summary.put("failed", failCount);
            if (truncated) summary.put("truncated", true);
            ArrayNode failures = summary.putArray("failures");
            for (PdfResult r : results) {
                if (r.bytes() == null) {
                    ObjectNode f = failures.objectNode();
                    f.put("responseId", r.responseId());
                    f.put("reason", r.error() != null ? r.error() : "unknown");
                    failures.add(f);
                }
            }
            ZipEntry summaryEntry = new ZipEntry("summary.json");
            zos.putNextEntry(summaryEntry);
            zos.write(MAPPER.writeValueAsBytes(summary));
            zos.closeEntry();
        }

        // Final counts (progress checkpoints raced with completion)
        checkpointProgress(batchJobId, (int) successCount, (int) failCount);
        return zipPath;
    }

    /** Persist per-row progress; counters are monotonic so last-write-wins is safe. */
    private void checkpointProgress(String batchJobId, int completed, int failed) {
        jobStore.findById(batchJobId).ifPresent(j ->
                jobStore.save(j.withProgress(completed, failed)));
    }

    // ── GET /api/v2/pdf-jobs/batch/{id} ──────────────────────────────────────

    public void getStatus(Context ctx) {
        String id = ctx.pathParam("id");
        JobRecord job = findBatchJob(id).orElse(null);
        if (job == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Batch job not found"));
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
        if (job == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Batch job not found"));
            return;
        }
        if (job.statusEnum() != JobStatus.COMPLETED) {
            ctx.status(HttpStatus.CONFLICT);
            ctx.json(Map.of("error", "Job not completed", "status", job.statusEnum().v2Name()));
            return;
        }
        Path zipPath = job.artifactPath() != null ? Path.of(job.artifactPath()) : null;
        if (zipPath == null || !Files.exists(zipPath)) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "ZIP result unavailable"));
            return;
        }
        byte[] zipBytes;
        try {
            zipBytes = Files.readAllBytes(zipPath);
        } catch (java.io.IOException e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "ZIP result unavailable"));
            return;
        }
        ctx.contentType("application/zip");
        ctx.header("Content-Disposition", "attachment; filename=\"batch-" + id + ".zip\"");
        ctx.header("Content-Length", String.valueOf(zipBytes.length));
        ctx.result(zipBytes);
        // One-shot download: drop the record and its artifacts
        jobStore.delete(job.jobId());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Optional<JobRecord> findBatchJob(String id) {
        return jobStore.findById(id)
                .filter(j -> JobRecord.TYPE_V2_BATCH.equals(j.jobType()));
    }

    private record PdfResult(String responseId, String filename, byte[] bytes, String error) {}
}
