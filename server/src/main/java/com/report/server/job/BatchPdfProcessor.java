package com.report.server.job;

import com.report.server.PdfRenderer;
import com.report.server.ProjectionMerger;
import com.report.server.ProjectionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import com.report.server.pdf.ImagePdfRenderer;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Stateless batch PDF processor. Generates N PDFs from a template projection,
 * one per data row, with per-row error isolation.
 */
public final class BatchPdfProcessor {

    private static final Logger log = LoggerFactory.getLogger(BatchPdfProcessor.class);
    private static final int SUB_BATCH_SIZE = 10;
    /** Bound concurrent PDF renders — each holds meaningful heap (issue #60). */
    private static final int MAX_CONCURRENT_RENDERS =
            Math.max(2, Math.min(8, Runtime.getRuntime().availableProcessors()));

    private final ProjectionRepository projRepo;
    private final JobRepository jobRepo;
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public BatchPdfProcessor(ProjectionRepository projRepo, JobRepository jobRepo) {
        this.projRepo = projRepo;
        this.jobRepo = jobRepo;
    }

    /**
     * Request cancellation of a job. Honored even if the job has not started
     * yet — the flag is registered eagerly so a pre-start cancel is not lost.
     */
    public void requestCancel(String jobId) {
        cancelFlags.computeIfAbsent(jobId, k -> new AtomicBoolean(false)).set(true);
    }

    /** Produces the projection JSON to render for a given zero-based row index. */
    @FunctionalInterface
    private interface RowProjection {
        String forRow(int index) throws Exception;
    }

    /**
     * Run a batch job with CSV data rows.
     * Each row produces one PDF with its data merged into the projection.
     */
    public void runWithData(String jobId, String templateId, List<Map<String, String>> rows) {
        String base = projRepo.getProjection(templateId).orElse("{\"templates\":[]}");
        execute(jobId, templateId, rows.size(), i -> ProjectionMerger.merge(base, rows.get(i)));
    }

    /**
     * Run a batch job: generate rowCount PDFs from the template projection.
     * Updates job progress in the repository as items are processed.
     */
    public void run(String jobId, String templateId, int rowCount) {
        String base = projRepo.getProjection(templateId).orElse("{\"templates\":[]}");
        execute(jobId, templateId, rowCount, i -> base);
    }

    /**
     * Shared batch loop for {@link #run} and {@link #runWithData} (issue #60):
     * status transition, per-row render with error isolation, cancellation
     * checks, progress checkpoints, ZIP archiving, and terminal status — the
     * only per-mode difference is how each row's projection is produced.
     */
    private void execute(String jobId, String templateId, int itemCount, RowProjection rowProjection) {
        // computeIfAbsent so a cancel requested before the job started is honored
        AtomicBoolean cancelFlag = cancelFlags.computeIfAbsent(jobId, k -> new AtomicBoolean(false));
        try {
            JobRecord job = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(job.withStatus(JobRecord.PROCESSING));

            Path outputDir = jobRepo.getOutputDir(jobId);
            Files.createDirectories(outputDir);

            // Rows render concurrently on virtual threads, bounded by a semaphore
            // so at most MAX_CONCURRENT_RENDERS PDFs are in flight at once (issue #60).
            AtomicInteger processed = new AtomicInteger();
            AtomicInteger failed = new AtomicInteger();
            AtomicInteger lastCheckpoint = new AtomicInteger();
            Semaphore permits = new Semaphore(MAX_CONCURRENT_RENDERS);

            try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
                java.util.List<Future<?>> futures = new java.util.ArrayList<>();
                for (int i = 0; i < itemCount; i++) {
                    if (cancelFlag.get()) break;
                    final int rowIdx = i;
                    permits.acquireUninterruptibly();
                    if (cancelFlag.get()) { permits.release(); break; }
                    futures.add(pool.submit(() -> {
                        try {
                            renderRow(jobId, rowIdx, outputDir, rowProjection);
                            processed.incrementAndGet();
                        } catch (Exception e) {
                            log.warn("Row {} failed in job {}: {}", rowIdx + 1, jobId, e.getMessage());
                            failed.incrementAndGet();
                        } finally {
                            permits.release();
                            checkpoint(jobId, processed, failed, lastCheckpoint);
                        }
                    }));
                }
                for (Future<?> f : futures) {
                    try { f.get(); } catch (Exception ignored) { /* per-row errors already counted */ }
                }
            }

            if (cancelFlag.get()) {
                log.info("Job {} cancelled ({}/{} rendered)", jobId, processed.get(), itemCount);
                JobRecord current = jobRepo.findById(jobId).orElseThrow();
                jobRepo.save(new JobRecord(jobId, templateId, "CANCELLED",
                    itemCount, processed.get(), failed.get(), "Cancelled by user",
                    current.createdAt(), System.currentTimeMillis(), System.currentTimeMillis()));
                return;
            }

            createZipArchive(jobId, outputDir);
            JobRecord finalJob = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(finalJob.withProgress(processed.get(), failed.get()).withStatus(JobRecord.COMPLETED));
            log.info("Job {} completed: {}/{} success, {} failed",
                    jobId, processed.get(), itemCount, failed.get());

        } catch (Exception e) {
            log.error("Job {} failed with unhandled exception", jobId, e);
            jobRepo.findById(jobId).ifPresent(j ->
                jobRepo.save(j.withError("PDF generation failed. Check server logs for details."))
            );
        } finally {
            cancelFlags.remove(jobId);
            ImagePdfRenderer.clearImageCache();
        }
    }

    private void renderRow(String jobId, int rowIdx, Path outputDir, RowProjection rowProjection)
            throws Exception {
        String projection = rowProjection.forRow(rowIdx);
        Path outputFile = outputDir.resolve(String.format("%04d.pdf", rowIdx + 1));
        try (BufferedOutputStream bos = new BufferedOutputStream(
                new FileOutputStream(outputFile.toFile()), 64 * 1024)) {
            PdfRenderer.renderToStream(projection, bos);
        }
    }

    /** Persist progress once per SUB_BATCH_SIZE completions (CAS guards against double-saves). */
    private void checkpoint(String jobId, AtomicInteger processed, AtomicInteger failed,
                            AtomicInteger lastCheckpoint) {
        int done = processed.get() + failed.get();
        int prev = lastCheckpoint.get();
        if (done - prev >= SUB_BATCH_SIZE && lastCheckpoint.compareAndSet(prev, done)) {
            jobRepo.findById(jobId).ifPresent(j ->
                    jobRepo.save(j.withProgress(processed.get(), failed.get())));
        }
    }

    private void createZipArchive(String jobId, Path outputDir) throws IOException {
        Path zipPath = jobRepo.getOutputZipPath(jobId);
        try (ZipOutputStream zos = new ZipOutputStream(
                new BufferedOutputStream(new FileOutputStream(zipPath.toFile()), 64 * 1024))) {
            try (var files = Files.list(outputDir)) {
                files.filter(p -> p.toString().endsWith(".pdf"))
                     .sorted()
                     .forEach(pdf -> {
                         try {
                             zos.putNextEntry(new ZipEntry(pdf.getFileName().toString()));
                             Files.copy(pdf, zos);
                             zos.closeEntry();
                         } catch (IOException e) {
                             log.warn("Failed to add {} to ZIP: {}", pdf, e.getMessage());
                         }
                     });
            }
        }
        log.info("Created ZIP archive for job {}: {}", jobId, zipPath);
    }
}
