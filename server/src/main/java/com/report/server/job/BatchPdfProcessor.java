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
import java.util.Optional;
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

    /**
     * Run a batch job with CSV data rows.
     * Each row produces one PDF with its data merged into the projection.
     */
    public void runWithData(String jobId, String templateId, List<Map<String, String>> rows) {
        AtomicBoolean cancelFlag = new AtomicBoolean(false);
        cancelFlags.put(jobId, cancelFlag);
        try {
            Optional<String> projOpt = projRepo.getProjection(templateId);
            String projectionJson = projOpt.orElse("{\"templates\":[]}");

            JobRecord job = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(job.withStatus(JobRecord.PROCESSING));

            Path outputDir = jobRepo.getOutputDir(jobId);
            Files.createDirectories(outputDir);

            int processed = 0;
            int failed = 0;

            for (int i = 0; i < rows.size(); i++) {
                if (cancelFlag.get()) {
                    log.info("Job {} cancelled at item {}/{}", jobId, i, rows.size());
                    JobRecord current = jobRepo.findById(jobId).orElseThrow();
                    jobRepo.save(new JobRecord(jobId, templateId, "CANCELLED",
                        rows.size(), processed, failed, "Cancelled by user",
                        current.createdAt(), System.currentTimeMillis(), System.currentTimeMillis()));
                    return;
                }
                try {
                    String mergedProjection = ProjectionMerger.merge(projectionJson, rows.get(i));
                    Path outputFile = outputDir.resolve(String.format("%04d.pdf", i + 1));
                    try (BufferedOutputStream bos = new BufferedOutputStream(
                            new FileOutputStream(outputFile.toFile()), 64 * 1024)) {
                        PdfRenderer.renderToStream(mergedProjection, bos);
                    }
                    processed++;
                } catch (Exception e) {
                    log.warn("Row {} failed in job {}: {}", i + 1, jobId, e.getMessage());
                    failed++;
                }

                if ((processed + failed) % SUB_BATCH_SIZE == 0 || i == rows.size() - 1) {
                    JobRecord current = jobRepo.findById(jobId).orElseThrow();
                    jobRepo.save(current.withProgress(processed, failed));
                }
            }

            createZipArchive(jobId, outputDir);
            JobRecord finalJob = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(finalJob.withProgress(processed, failed).withStatus(JobRecord.COMPLETED));
            log.info("Job {} completed: {}/{} success, {} failed", jobId, processed, rows.size(), failed);

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

    /**
     * Run a batch job: generate rowCount PDFs from the template projection.
     * Updates job progress in the repository as items are processed.
     */
    public void run(String jobId, String templateId, int rowCount) {
        AtomicBoolean cancelFlag = new AtomicBoolean(false);
        cancelFlags.put(jobId, cancelFlag);
        try {
            // Load template projection
            Optional<String> projOpt = projRepo.getProjection(templateId);
            String projectionJson = projOpt.orElse("{\"templates\":[]}");

            // Update status to PROCESSING
            JobRecord job = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(job.withStatus(JobRecord.PROCESSING));

            // Ensure output directory
            Path outputDir = jobRepo.getOutputDir(jobId);
            Files.createDirectories(outputDir);

            int processed = 0;
            int failed = 0;

            // Process in sub-batches
            for (int i = 0; i < rowCount; i++) {
                // Check cancel flag before each item
                if (cancelFlag.get()) {
                    log.info("Job {} cancelled at item {}/{}", jobId, i, rowCount);
                    JobRecord current = jobRepo.findById(jobId).orElseThrow();
                    jobRepo.save(new JobRecord(jobId, templateId, "CANCELLED",
                        rowCount, processed, failed, "Cancelled by user",
                        current.createdAt(), System.currentTimeMillis(), System.currentTimeMillis()));
                    return;
                }
                try {
                    Path outputFile = outputDir.resolve(String.format("%04d.pdf", i + 1));
                    try (BufferedOutputStream bos = new BufferedOutputStream(
                            new FileOutputStream(outputFile.toFile()), 64 * 1024)) {
                        PdfRenderer.renderToStream(projectionJson, bos);
                    }
                    processed++;
                } catch (Exception e) {
                    log.warn("Row {} failed in job {}: {}", i + 1, jobId, e.getMessage());
                    failed++;
                }

                // Checkpoint progress every SUB_BATCH_SIZE items
                if ((processed + failed) % SUB_BATCH_SIZE == 0 || i == rowCount - 1) {
                    JobRecord current = jobRepo.findById(jobId).orElseThrow();
                    jobRepo.save(current.withProgress(processed, failed));
                }
            }

            // Create ZIP archive
            createZipArchive(jobId, outputDir);

            // Mark completed
            JobRecord finalJob = jobRepo.findById(jobId).orElseThrow();
            jobRepo.save(finalJob.withProgress(processed, failed).withStatus(JobRecord.COMPLETED));

            log.info("Job {} completed: {}/{} success, {} failed",
                jobId, processed, rowCount, failed);

        } catch (Exception e) {
            log.error("Job {} failed with unhandled exception", jobId, e);
            jobRepo.findById(jobId).ifPresent(job ->
                jobRepo.save(job.withError("PDF generation failed. Check server logs for details."))
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
