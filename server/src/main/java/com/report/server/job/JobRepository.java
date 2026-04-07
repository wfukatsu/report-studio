package com.report.server.job;

import com.report.server.JsonBlobRepository;
import com.scalar.db.service.TransactionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Job repository backed by ScalarDB for metadata persistence
 * and local filesystem for PDF output files.
 *
 * <p>Metadata (JobRecord) is stored as JSON in ScalarDB table {@code report_studio.jobs}.
 * Output PDFs and ZIP archives remain on the local filesystem under {@code data/jobs/{jobId}/}.
 */
public final class JobRepository {

    private static final Logger log = LoggerFactory.getLogger(JobRepository.class);
    private static final String NAMESPACE = "report_studio";
    private static final String TABLE = "jobs";
    private static final Path JOBS_DIR = Path.of("data", "jobs");

    private final JsonBlobRepository blob;

    public JobRepository(TransactionFactory factory) {
        this.blob = new JsonBlobRepository(factory, NAMESPACE, TABLE);
        try {
            Files.createDirectories(JOBS_DIR);
        } catch (IOException e) {
            log.warn("Could not create jobs directory: {}", e.getMessage());
        }
    }

    /** Create namespace and table if they don't exist. */
    public void ensureTable() {
        blob.ensureTable();
    }

    /** Save or update a job record. */
    public void save(JobRecord record) {
        try {
            blob.put(record.jobId(), record.toJson());
        } catch (Exception e) {
            log.error("Failed to save job {}", record.jobId(), e);
        }
    }

    /** Find a job by ID. */
    public Optional<JobRecord> findById(String jobId) {
        return blob.get(jobId).flatMap(json -> {
            try {
                return Optional.of(JobRecord.fromJson(json));
            } catch (IOException e) {
                log.warn("Failed to parse job {}: {}", jobId, e.getMessage());
                return Optional.empty();
            }
        });
    }

    /** List all jobs, sorted by creation date descending. */
    public List<JobRecord> listAll() {
        return blob.list().stream()
                .map(json -> {
                    try {
                        return JobRecord.fromJson(json);
                    } catch (IOException e) {
                        log.warn("Skipping corrupt job record: {}", e.getMessage());
                        return null;
                    }
                })
                .filter(j -> j != null)
                .sorted(Comparator.comparingLong(JobRecord::createdAt).reversed())
                .toList();
    }

    /** Delete a job record and its output files. */
    public void delete(String jobId) {
        blob.delete(jobId);
        // Clean up local output files
        Path jobDir = JOBS_DIR.resolve(jobId);
        if (Files.exists(jobDir)) {
            try (var files = Files.walk(jobDir)) {
                files.sorted(Comparator.reverseOrder())
                     .forEach(path -> {
                         try { Files.deleteIfExists(path); } catch (IOException ignored) {}
                     });
            } catch (IOException e) {
                log.warn("Failed to clean up job files for {}: {}", jobId, e.getMessage());
            }
        }
        // Clean up ZIP
        Path zipPath = getOutputZipPath(jobId);
        try { Files.deleteIfExists(zipPath); } catch (IOException ignored) {}
        log.info("Deleted job {} and its output files", jobId);
    }

    /** Get the output directory for a job. */
    public Path getOutputDir(String jobId) {
        return JOBS_DIR.resolve(jobId).resolve("output");
    }

    /** Get the ZIP output path for a job. */
    public Path getOutputZipPath(String jobId) {
        return JOBS_DIR.resolve(jobId).resolve("output.zip");
    }

    /** Reconcile orphaned jobs on startup: mark PROCESSING/PENDING as FAILED. */
    public void reconcileOrphans() {
        for (JobRecord job : listAll()) {
            if (!job.isTerminal()) {
                log.warn("Reconciling orphan job {} (was {})", job.jobId(), job.status());
                save(job.withError("Server restarted while job was " + job.status()));
            }
        }
    }
}
