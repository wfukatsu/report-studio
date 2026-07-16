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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Stateless batch PDF processor. Generates N PDFs from a template projection,
 * one per data row, with per-row error isolation.
 */
public final class BatchPdfProcessor {

    private static final Logger log = LoggerFactory.getLogger(BatchPdfProcessor.class);
    private static final int SUB_BATCH_SIZE = 10;

    private final ProjectionRepository projRepo;
    private final JobRepository jobRepo;
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public BatchPdfProcessor(ProjectionRepository projRepo, JobRepository jobRepo) {
        this.projRepo = projRepo;
        this.jobRepo = jobRepo;
    }

    /** Request cancellation of a running job. */
    public void requestCancel(String jobId) {
        AtomicBoolean flag = cancelFlags.get(jobId);
        if (flag != null) flag.set(true);
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
        AtomicBoolean cancelFlag = new AtomicBoolean(false);
        cancelFlags.put(jobId, cancelFlag);
        try {
            JobRecord job = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(job.withStatus(JobRecord.PROCESSING));

            Path outputDir = jobRepo.getOutputDir(jobId);
            Files.createDirectories(outputDir);

            int processed = 0;
            int failed = 0;

            for (int i = 0; i < itemCount; i++) {
                if (cancelFlag.get()) {
                    log.info("Job {} cancelled at item {}/{}", jobId, i, itemCount);
                    JobRecord current = jobRepo.findById(jobId).orElseThrow();
                    jobRepo.save(new JobRecord(jobId, templateId, "CANCELLED",
                        itemCount, processed, failed, "Cancelled by user",
                        current.createdAt(), System.currentTimeMillis(), System.currentTimeMillis()));
                    return;
                }
                try {
                    String projection = rowProjection.forRow(i);
                    Path outputFile = outputDir.resolve(String.format("%04d.pdf", i + 1));
                    try (BufferedOutputStream bos = new BufferedOutputStream(
                            new FileOutputStream(outputFile.toFile()), 64 * 1024)) {
                        PdfRenderer.renderToStream(projection, bos);
                    }
                    processed++;
                } catch (Exception e) {
                    log.warn("Row {} failed in job {}: {}", i + 1, jobId, e.getMessage());
                    failed++;
                }

                if ((processed + failed) % SUB_BATCH_SIZE == 0 || i == itemCount - 1) {
                    JobRecord current = jobRepo.findById(jobId).orElseThrow();
                    jobRepo.save(current.withProgress(processed, failed));
                }
            }

            createZipArchive(jobId, outputDir);
            JobRecord finalJob = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(finalJob.withProgress(processed, failed).withStatus(JobRecord.COMPLETED));
            log.info("Job {} completed: {}/{} success, {} failed", jobId, processed, itemCount, failed);

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
