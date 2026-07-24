package com.report.server.job;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.JsonBlobRepository;
import com.report.server.PdfRenderer;
import com.report.server.V2RenderSupport;
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
 * Executes V2 batch PDF jobs: renders each input in parallel on the shared {@code pdfExecutor} and
 * streams the result ZIP to the job's artifact path. Extracted from {@code BatchPdfController}
 * (issue #420) so the HTTP layer no longer owns thread pools or ZIP assembly.
 *
 * <p>Runs on the unified job abstraction (issue #60): metadata persisted via {@link JobStore}, the
 * result ZIP streamed to {@code data/jobs/{id}/output.zip} (previously held on-heap as a byte
 * array), TTL reaped by the shared reaper, restart-reconciled like every other job type, and
 * admission-capped by the shared limiter (previously unbounded).
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
public final class BatchPdfOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(BatchPdfOrchestrator.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static final long MAX_ZIP_BYTES = 100L * 1024 * 1024; // 100 MB
    static final long BATCH_TIMEOUT_SECONDS = 300; // 5 minutes
    private static final int MAX_ACTIVE_JOBS = 10;

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

    public BatchPdfOrchestrator(
            JsonBlobRepository responseRepo, JobStore jobStore, ExecutorService pdfExecutor) {
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

    /**
     * Admission control (issue #60) — a successful acquire reserves one of the {@link
     * #MAX_ACTIVE_JOBS} slots; the slot is released when the submitted job's coordinator finishes.
     */
    public boolean tryAcquire() {
        return limiter.tryAcquire();
    }

    /**
     * Runs the batch coordinator asynchronously for an already-persisted, admission-acquired job.
     * Releases the admission slot when the coordinator finishes (success or failure).
     */
    public void submit(
            JobRecord job,
            String templateId,
            String rawDef,
            List<BatchInput> inputs,
            String filenameTemplate,
            String userId) {
        final String batchJobId = job.jobId();
        CompletableFuture.runAsync(
                () -> {
                    jobStore.save(job.withStatus(JobStatus.PROCESSING));
                    try {
                        // NB: coordinatorExecutor, NOT pdfExecutor — see class Javadoc (#204).
                        Path zipPath =
                                generateBatchZip(
                                        batchJobId,
                                        templateId,
                                        rawDef,
                                        inputs,
                                        filenameTemplate,
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
                    String fn =
                            OutputFilenameTemplate.uniqueName(
                                    usedNames, seqStr + "_" + dateStr + ".pdf");
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
                    OutputFilenameTemplate.buildFilename(
                            filenameTemplate, seqStr, dateStr, documentNumber, status, dataNode);
            final String filename = OutputFilenameTemplate.uniqueName(usedNames, desiredName);
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

    /** One batch input: either a stored response id, or an inline data object (DB row). */
    public record BatchInput(String responseId, JsonNode inlineData) {}

    private record PdfResult(String responseId, String filename, byte[] bytes, String error) {}
}
