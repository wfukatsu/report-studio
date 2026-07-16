package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
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
 * <p>Generates PDFs in parallel using the shared pdfExecutor (max 4 threads).
 * Partial failures produce a ZIP of successful PDFs + summary.json.
 * All-fail → 500 with no ZIP.
 */
public final class V2BatchPdfController {

    private static final Logger log = LoggerFactory.getLogger(V2BatchPdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static final int MAX_BATCH_SIZE = 50;
    static final long MAX_ZIP_BYTES = 100L * 1024 * 1024; // 100 MB
    static final long BATCH_TIMEOUT_SECONDS = 300; // 5 minutes
    static final long TTL_SECONDS = 300;

    private final JsonBlobRepository definitionsRepo;
    private final JsonBlobRepository responseRepo;
    private final ExecutorService pdfExecutor;

    private final ConcurrentHashMap<String, BatchJobRecord> jobs = new ConcurrentHashMap<>();

    public V2BatchPdfController(JsonBlobRepository definitionsRepo,
                                 JsonBlobRepository responseRepo,
                                 ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.responseRepo = responseRepo;
        this.pdfExecutor = pdfExecutor;
    }

    // ── POST /api/v2/pdf-jobs/batch ───────────────────────────────────────────

    public void submitBatch(Context ctx) throws Exception {
        evictExpired();

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

        String batchJobId = "batch-" + UUID.randomUUID();
        long now = Instant.now().getEpochSecond();
        BatchJobRecord job = new BatchJobRecord(batchJobId, templateId, "pending", null, null,
                responseIds.size(), 0, 0, now);
        jobs.put(batchJobId, job);

        final String finalTemplateId = templateId;
        final String finalRaw = rawOpt.get();
        final List<String> finalIds = responseIds;
        final String userId = principal.userId();

        CompletableFuture.runAsync(() -> {
            jobs.put(batchJobId, job.withStatus("processing"));
            try {
                byte[] zipBytes = generateBatchZip(batchJobId, finalTemplateId, finalRaw, finalIds, userId);
                jobs.put(batchJobId, jobs.get(batchJobId).withCompleted(zipBytes));
                log.info("Batch PDF job {} completed ({} bytes)", batchJobId, zipBytes.length);
            } catch (Exception e) {
                jobs.put(batchJobId, jobs.get(batchJobId).withFailed(e.getMessage()));
                log.error("Batch PDF job {} failed", batchJobId, e);
            }
        }, pdfExecutor);

        ctx.status(HttpStatus.ACCEPTED);
        ctx.json(Map.of(
            "batchJobId", batchJobId,
            "totalCount", responseIds.size(),
            "status", "pending",
            "statusUrl", "/api/v2/pdf-jobs/batch/" + batchJobId
        ));
    }

    private byte[] generateBatchZip(String batchJobId, String templateId, String rawDef,
                                     List<String> responseIds, String userId) throws Exception {
        JsonNode definitionNode = MAPPER.readTree(rawDef);
        String dateStr = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(java.time.ZoneOffset.UTC)
                .format(Instant.now());

        List<CompletableFuture<PdfResult>> futures = new ArrayList<>();
        int[] seqArr = {0};

        for (String responseId : responseIds) {
            int seq = ++seqArr[0];
            String seqStr = String.format("%03d", seq);

            // Fetch response data
            Optional<String> respOpt;
            try { respOpt = responseRepo.get(responseId); }
            catch (Exception e) {
                futures.add(CompletableFuture.completedFuture(
                    new PdfResult(responseId, seqStr + "_" + dateStr + ".pdf", null, "Response not found: " + responseId)));
                continue;
            }
            if (respOpt.isEmpty()) {
                futures.add(CompletableFuture.completedFuture(
                    new PdfResult(responseId, seqStr + "_" + dateStr + ".pdf", null, "Response not found")));
                continue;
            }

            final String respJson = respOpt.get();
            final String filename = seqStr + "_" + dateStr + ".pdf";
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
                    // Update progress
                    BatchJobRecord cur = jobs.get(batchJobId);
                    if (cur != null) jobs.put(batchJobId, cur.incCompleted());
                    return new PdfResult(responseId, filename, pdfBytes, null);
                } catch (Exception ex) {
                    BatchJobRecord cur = jobs.get(batchJobId);
                    if (cur != null) jobs.put(batchJobId, cur.incFailed());
                    return new PdfResult(responseId, filename, null, ex.getMessage());
                }
            }, pdfExecutor);
            futures.add(future);
        }

        // Wait for all (with timeout)
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .get(BATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        // Build ZIP
        List<PdfResult> results = futures.stream()
                .map(f -> f.getNow(null))
                .filter(Objects::nonNull)
                .toList();

        long successCount = results.stream().filter(r -> r.bytes() != null).count();
        long failCount = results.stream().filter(r -> r.bytes() == null).count();

        if (successCount == 0) {
            throw new RuntimeException("All PDF generations failed");
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        long bytesWritten = 0;
        boolean truncated = false;

        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
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

        return baos.toByteArray();
    }

    // ── GET /api/v2/pdf-jobs/batch/{id} ──────────────────────────────────────

    public void getStatus(Context ctx) {
        String id = ctx.pathParam("id");
        BatchJobRecord job = jobs.get(id);
        if (job == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Batch job not found"));
            return;
        }
        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("batchJobId", job.batchJobId());
        resp.put("status", job.status());
        resp.put("total", job.total());
        resp.put("completed", job.completed());
        resp.put("failed", job.failed());
        if (job.error() != null) resp.put("error", job.error());
        ctx.json(resp);
        if (!job.isTerminal()) ctx.header("Retry-After", "2");
    }

    // ── GET /api/v2/pdf-jobs/batch/{id}/result ────────────────────────────────

    public void getResult(Context ctx) {
        String id = ctx.pathParam("id");
        BatchJobRecord job = jobs.get(id);
        if (job == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Batch job not found"));
            return;
        }
        if (!"completed".equals(job.status())) {
            ctx.status(HttpStatus.CONFLICT);
            ctx.json(Map.of("error", "Job not completed", "status", job.status()));
            return;
        }
        byte[] zipBytes = job.zipBytes();
        if (zipBytes == null) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "ZIP result unavailable"));
            return;
        }
        ctx.contentType("application/zip");
        ctx.header("Content-Disposition", "attachment; filename=\"batch-" + id + ".zip\"");
        ctx.header("Content-Length", String.valueOf(zipBytes.length));
        ctx.result(zipBytes);
        jobs.remove(id);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void evictExpired() {
        long cutoff = Instant.now().getEpochSecond() - TTL_SECONDS;
        jobs.entrySet().removeIf(e -> e.getValue().createdAt() < cutoff);
    }

    private record PdfResult(String responseId, String filename, byte[] bytes, String error) {}

    record BatchJobRecord(
            String batchJobId, String templateId, String status,
            byte[] zipBytes, String error,
            int total, int completed, int failed, long createdAt) {

        boolean isTerminal() { return "completed".equals(status) || "failed".equals(status); }

        BatchJobRecord withStatus(String s) {
            return new BatchJobRecord(batchJobId, templateId, s, null, null, total, completed, failed, createdAt);
        }
        BatchJobRecord withCompleted(byte[] zip) {
            return new BatchJobRecord(batchJobId, templateId, "completed", zip, null, total, completed, failed, createdAt);
        }
        BatchJobRecord withFailed(String msg) {
            return new BatchJobRecord(batchJobId, templateId, "failed", null, msg, total, completed, failed, createdAt);
        }
        BatchJobRecord incCompleted() {
            return new BatchJobRecord(batchJobId, templateId, status, zipBytes, error, total, completed + 1, failed, createdAt);
        }
        BatchJobRecord incFailed() {
            return new BatchJobRecord(batchJobId, templateId, status, zipBytes, error, total, completed, failed + 1, createdAt);
        }
    }
}
