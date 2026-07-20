package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.job.JobConcurrencyLimiter;
import com.report.server.job.JobController;
import com.report.server.job.JobRecord;
import com.report.server.job.JobStatus;
import com.report.server.job.JobStore;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
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
 * <p>Runs on the unified job abstraction (issue #60): metadata persisted via {@link JobStore}, the
 * result ZIP streamed to {@code data/jobs/{id}/output.zip} (previously held on-heap as a byte
 * array), TTL reaped by the shared reaper, restart-reconciled like every other job type, and
 * admission-capped by the shared limiter (previously unbounded). The V2 API keeps its historical
 * response shape and lowercase status vocabulary.
 *
 * <p>Generates PDFs in parallel using the shared pdfExecutor (max 4 threads). Partial failures
 * produce a ZIP of successful PDFs + summary.json. All-fail → failed job with no ZIP.
 *
 * <p><b>Threading (issue #204):</b> the per-job <em>coordinator</em> runs on a dedicated {@link
 * #coordinatorExecutor}, never on {@code pdfExecutor}. The coordinator blocks on {@code
 * allOf(...).get()} waiting for the render tasks it submits to {@code pdfExecutor}; if coordinators
 * ran on {@code pdfExecutor} too, enough concurrent batches would occupy every rendering thread
 * with blocked coordinators and their own render tasks could never be scheduled — a self-inflicted
 * deadlock until the timeout. Keeping the two pools separate makes that impossible.
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

    /**
     * Runs the batch coordinators. Sized to {@link #MAX_ACTIVE_JOBS} so every admitted batch
     * (admission is capped by {@link #limiter}) gets its own thread to block on without ever
     * competing with the render tasks on {@code pdfExecutor} (issue #204).
     */
    private final ExecutorService coordinatorExecutor;

    private final JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(MAX_ACTIVE_JOBS);

    public BatchPdfController(
            JsonBlobRepository definitionsRepo,
            JsonBlobRepository responseRepo,
            JobStore jobStore,
            ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.responseRepo = responseRepo;
        this.jobStore = jobStore;
        this.pdfExecutor = pdfExecutor;
        this.coordinatorExecutor =
                Executors.newFixedThreadPool(
                        MAX_ACTIVE_JOBS,
                        r -> {
                            Thread t = new Thread(r, "batch-pdf-coordinator");
                            t.setDaemon(true);
                            return t;
                        });
    }

    /** Stops the coordinator pool. Call from {@code AppWiring.shutdown()}. */
    public void shutdown() {
        coordinatorExecutor.shutdown();
        try {
            if (!coordinatorExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                coordinatorExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            coordinatorExecutor.shutdownNow();
        }
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
        try {
            req = MAPPER.readTree(ctx.body());
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        String templateId = req.path("templateId").asText(null);
        if (templateId == null || templateId.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "templateId is required"));
            return;
        }

        // Two input modes (issue #193): stored form responses (responseIds) OR inline
        // data rows (rows) for DB-row-driven bulk export. Exactly one must be present.
        JsonNode idsNode = req.path("responseIds");
        JsonNode rowsNode = req.path("rows");
        boolean hasIds = idsNode.isArray() && idsNode.size() > 0;
        boolean hasRows = rowsNode.isArray() && rowsNode.size() > 0;
        if (hasIds == hasRows) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(
                    Map.of(
                            "error",
                            "Provide exactly one of a non-empty responseIds or rows array"));
            return;
        }
        int inputSize = hasIds ? idsNode.size() : rowsNode.size();
        if (inputSize > MAX_BATCH_SIZE) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Maximum batch size is " + MAX_BATCH_SIZE));
            return;
        }

        // Optional output filename template (issue #194), e.g. "{documentNo}_{customer.name}.pdf"
        String filenameTemplate = req.path("filenameTemplate").asText(null);
        if (filenameTemplate != null && filenameTemplate.isBlank()) filenameTemplate = null;

        // Build the input list for either mode.
        List<BatchInput> inputs = new ArrayList<>();
        if (hasIds) {
            for (JsonNode id : idsNode) {
                if (id.isTextual() && !id.asText().isBlank())
                    inputs.add(new BatchInput(id.asText(), null));
            }
        } else {
            for (JsonNode row : rowsNode) {
                if (row.isObject()) inputs.add(new BatchInput(null, row));
            }
        }
        if (inputs.isEmpty()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "No valid items to render"));
            return;
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
        JobRecord job =
                JobRecord.create(
                        batchJobId,
                        templateId,
                        JobRecord.TYPE_V2_BATCH,
                        principal.userId(),
                        inputs.size(),
                        System.currentTimeMillis() + TTL_SECONDS * 1000);
        jobStore.save(job);

        final String finalTemplateId = templateId;
        final String finalRaw = rawOpt.get();
        final List<BatchInput> finalInputs = inputs;
        final String finalFilenameTemplate = filenameTemplate;
        final String userId = principal.userId();

        CompletableFuture.runAsync(
                () -> {
                    jobStore.save(job.withStatus(JobStatus.PROCESSING));
                    try {
                        // NB: coordinatorExecutor, NOT pdfExecutor — see class Javadoc (#204).
                        Path zipPath =
                                generateBatchZip(
                                        batchJobId,
                                        finalTemplateId,
                                        finalRaw,
                                        finalInputs,
                                        finalFilenameTemplate,
                                        userId);
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
                },
                coordinatorExecutor);

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

    /**
     * Renders each input (stored response or inline row) and streams the ZIP to the job's artifact
     * path.
     */
    private Path generateBatchZip(
            String batchJobId,
            String templateId,
            String rawDef,
            List<BatchInput> inputs,
            String filenameTemplate,
            String userId)
            throws Exception {
        // The stored blob is an envelope {created_by, definition:{pages,...}, ...}.
        // renderDefinition expects the inner ReportDefinition (it reads `pages`
        // from the root), so unwrap `.definition` — passing the whole envelope
        // renders a single blank page (~534B) and the job still reports success
        // (#153). Fall back to the node itself for bare-definition blobs.
        JsonNode envelope = MAPPER.readTree(rawDef);
        JsonNode definitionNode =
                envelope.has("definition") ? envelope.path("definition") : envelope;
        String dateStr =
                DateTimeFormatter.ofPattern("yyyyMMdd")
                        .withZone(java.time.ZoneOffset.UTC)
                        .format(Instant.now());

        AtomicInteger completedCount = new AtomicInteger();
        AtomicInteger failedCount = new AtomicInteger();

        List<CompletableFuture<PdfResult>> futures = new ArrayList<>();
        // Guard against filename collisions from the template producing duplicate names.
        Set<String> usedNames = java.util.concurrent.ConcurrentHashMap.newKeySet();
        int seq = 0;

        for (BatchInput input : inputs) {
            seq++;
            final int seqNum = seq;
            final String seqStr = String.format("%03d", seq);
            final String label = input.responseId() != null ? input.responseId() : "row-" + seqStr;

            // Resolve the data node (and doc number / status for filename tokens).
            ObjectNode dataNode;
            String documentNumber = "";
            String status = "";
            if (input.responseId() != null) {
                Optional<String> respOpt;
                try {
                    respOpt = responseRepo.get(input.responseId());
                } catch (Exception e) {
                    respOpt = Optional.empty();
                }
                if (respOpt.isEmpty()) {
                    failedCount.incrementAndGet();
                    String fn = uniqueName(usedNames, seqStr + "_" + dateStr + ".pdf");
                    futures.add(
                            CompletableFuture.completedFuture(
                                    new PdfResult(label, fn, null, "Response not found")));
                    continue;
                }
                JsonNode resp = MAPPER.readTree(respOpt.get());
                JsonNode d = resp.path("data");
                dataNode = (d.isObject()) ? (ObjectNode) d : MAPPER.createObjectNode();
                documentNumber = resp.path("documentNumber").asText("");
                status = resp.path("status").asText("");
            } else {
                dataNode = (ObjectNode) input.inlineData();
            }

            String desiredName =
                    buildFilename(
                            filenameTemplate, seqStr, dateStr, documentNumber, status, dataNode);
            final String filename = uniqueName(usedNames, desiredName);
            final JsonNode defNode = definitionNode;
            final ObjectNode finalData = dataNode;

            CompletableFuture<PdfResult> future =
                    CompletableFuture.supplyAsync(
                            () -> {
                                try {
                                    String defJson =
                                            V2RenderSupport.prepare(defNode, finalData, null);
                                    byte[] pdfBytes = PdfRenderer.renderDefinition(defJson);
                                    checkpointProgress(
                                            batchJobId,
                                            completedCount.incrementAndGet(),
                                            failedCount.get());
                                    return new PdfResult(label, filename, pdfBytes, null);
                                } catch (Exception ex) {
                                    checkpointProgress(
                                            batchJobId,
                                            completedCount.get(),
                                            failedCount.incrementAndGet());
                                    return new PdfResult(label, filename, null, ex.getMessage());
                                }
                            },
                            pdfExecutor);
            futures.add(future);
        }

        // Wait for all (with timeout). On timeout, cancel the outstanding render futures
        // so a stuck batch stops holding slots and completes as failed promptly (issue #204).
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .get(BATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException te) {
            for (CompletableFuture<PdfResult> f : futures) {
                f.cancel(true);
            }
            throw te;
        }

        List<PdfResult> results =
                futures.stream().map(f -> f.getNow(null)).filter(Objects::nonNull).toList();

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

        try (ZipOutputStream zos =
                new ZipOutputStream(
                        new BufferedOutputStream(Files.newOutputStream(zipPath), 64 * 1024))) {
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

            // summary.json — enriched manifest (issue #194): per-entry filename + outcome
            ObjectNode summary = MAPPER.createObjectNode();
            summary.put("completed", successCount);
            summary.put("failed", failCount);
            if (truncated) summary.put("truncated", true);
            ArrayNode entries = summary.putArray("entries");
            for (PdfResult r : results) {
                ObjectNode e = entries.objectNode();
                e.put("label", r.responseId());
                e.put("filename", r.filename());
                e.put("ok", r.bytes() != null);
                if (r.bytes() == null) e.put("reason", r.error() != null ? r.error() : "unknown");
                entries.add(e);
            }
            // Backward-compatible failures list
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
        jobStore.findById(batchJobId)
                .ifPresent(j -> jobStore.save(j.withProgress(completed, failed)));
    }

    // ── GET /api/v2/pdf-jobs/batch/{id} ──────────────────────────────────────

    public void getStatus(Context ctx) {
        String id = ctx.pathParam("id");
        JobRecord job = findBatchJob(id).orElse(null);
        // Owner-scoped: reject (as 404, to avoid job-ID enumeration) jobs the caller does not
        // own. Previously any authenticated user who knew a job ID could read another user's
        // batch status (issue #199). Mirrors PdfJobController / JobController.
        if (job == null || !JobController.canAccess(ctx, job)) {
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
        // Owner-scoped: a non-owner must not download (and, via the one-shot delete below,
        // destroy) another user's result ZIP (issue #199). 404 to avoid job-ID enumeration.
        if (job == null || !JobController.canAccess(ctx, job)) {
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
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "ZIP result unavailable"));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Optional<JobRecord> findBatchJob(String id) {
        return jobStore.findById(id).filter(j -> JobRecord.TYPE_V2_BATCH.equals(j.jobType()));
    }

    // ── Filename templating (issue #194) ────────────────────────────────────────

    private static final java.util.regex.Pattern TOKEN =
            java.util.regex.Pattern.compile("\\{([^{}]+)\\}");

    /**
     * Build the ZIP entry name for one item. With no template, falls back to the historical {@code
     * NNN_yyyyMMdd.pdf} form. Tokens: {@code {seq}}, {@code {date}}, {@code {documentNo}}/{@code
     * {documentNumber}}, {@code {status}}, and any dot-notation data field (e.g. {@code
     * {customer.name}}). Unknown tokens resolve to empty. Result is sanitized and always ends in
     * {@code .pdf}.
     */
    static String buildFilename(
            String template,
            String seqStr,
            String dateStr,
            String documentNumber,
            String status,
            JsonNode data) {
        if (template == null || template.isBlank()) {
            return seqStr + "_" + dateStr + ".pdf";
        }
        Map<String, String> flat = new HashMap<>();
        flattenLeaves(data, "", flat);
        java.util.regex.Matcher m = TOKEN.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String key = m.group(1).trim();
            String value =
                    switch (key) {
                        case "seq" -> seqStr;
                        case "date" -> dateStr;
                        case "documentNo", "documentNumber" ->
                                documentNumber == null ? "" : documentNumber;
                        case "status" -> status == null ? "" : status;
                        default -> flat.getOrDefault(key, "");
                    };
            m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        // Strip a template-supplied .pdf before sanitizing so trailing underscores from
        // empty tokens (e.g. "{missing}_A_{missing}.pdf") don't cling to the extension.
        String base = sanitizeFilename(sb.toString().replaceAll("(?i)\\.pdf$", ""));
        if (base.isBlank()) base = seqStr + "_" + dateStr;
        return base + ".pdf";
    }

    /** Replace path separators and characters unsafe in ZIP entry / OS filenames. */
    static String sanitizeFilename(String raw) {
        String s =
                raw.replace('/', '_')
                        .replace('\\', '_')
                        .replaceAll("[\\x00-\\x1f<>:\"|?*]", "_")
                        .trim();
        // Collapse redundant underscores, strip a trailing dot, and trim stray edges.
        s = s.replaceAll("_{2,}", "_").replaceAll("\\.+$", "").replaceAll("^_+|_+$", "");
        if (s.length() > 180) s = s.substring(0, 180);
        return s;
    }

    /** Ensure uniqueness within the ZIP by suffixing collisions with a counter. */
    private static String uniqueName(Set<String> used, String name) {
        if (used.add(name)) return name;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; ; i++) {
            String candidate = base + "_" + i + ext;
            if (used.add(candidate)) return candidate;
        }
    }

    /** Flatten scalar leaves of a JSON object into dot-notation keys for token lookup. */
    private static void flattenLeaves(JsonNode node, String prefix, Map<String, String> out) {
        if (node == null || !node.isObject()) return;
        var fields = node.fields();
        while (fields.hasNext()) {
            var f = fields.next();
            String key = prefix.isEmpty() ? f.getKey() : prefix + "." + f.getKey();
            JsonNode v = f.getValue();
            if (v.isObject()) {
                flattenLeaves(v, key, out);
            } else if (!v.isArray()) {
                out.put(key, v.asText(""));
            }
        }
    }

    /** One batch input: either a stored response id, or an inline data object (DB row). */
    private record BatchInput(String responseId, JsonNode inlineData) {}

    private record PdfResult(String responseId, String filename, byte[] bytes, String error) {}
}
