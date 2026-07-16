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
 * and local filesystem for PDF output files — the {@link JobStore}
 * implementation shared by every job stack (issue #60).
 *
 * <p>Metadata (JobRecord) is stored as JSON in ScalarDB table {@code report_studio.jobs}.
 * Output PDFs and ZIP archives remain on the local filesystem under {@code data/jobs/{jobId}/}.
 */
public final class JobRepository implements JobStore {

    private static final Logger log = LoggerFactory.getLogger(JobRepository.class);
    private static final String NAMESPACE = "report_studio";
    private static final String TABLE = "jobs";
    private static final int SAVE_ATTEMPTS = 3;
    private static final long SAVE_RETRY_BACKOFF_MS = 200;
    // Resolved to an absolute path once at startup so containment checks are
    // stable regardless of later working-directory changes (issue #58)
    private static final Path JOBS_DIR = Path.of("data", "jobs").toAbsolutePath().normalize();

    /** Absolute root under which all job artifacts live — containment-check anchor. */
    public static Path jobsRoot() {
        return JOBS_DIR;
    }

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

    /**
     * Save or update a job record, retrying transient failures (issue #60).
     * A save that still fails after retries is logged as an alert — the job's
     * visible status will lag reality until the next successful checkpoint.
     */
    @Override
    public void save(JobRecord record) {
        for (int attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
            try {
                blob.put(record.jobId(), record.toJson());
                return;
            } catch (Exception e) {
                if (attempt == SAVE_ATTEMPTS) {
                    log.error("ALERT: failed to save job {} after {} attempts — "
                            + "job status may be stale", record.jobId(), SAVE_ATTEMPTS, e);
                    return;
                }
                log.warn("Failed to save job {} (attempt {}/{}): {}",
                        record.jobId(), attempt, SAVE_ATTEMPTS, e.getMessage());
                try {
                    Thread.sleep(SAVE_RETRY_BACKOFF_MS * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    /** Find a job by ID. */
    @Override
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
    @Override
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
    @Override
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

    /** Root directory for a job's artifacts. */
    @Override
    public Path jobDir(String jobId) {
        return JOBS_DIR.resolve(jobId);
    }

    /** Get the output directory for a job. */
    @Override
    public Path getOutputDir(String jobId) {
        return JOBS_DIR.resolve(jobId).resolve("output");
    }

    /** Get the ZIP output path for a job. */
    @Override
    public Path getOutputZipPath(String jobId) {
        return JOBS_DIR.resolve(jobId).resolve("output.zip");
    }

    /**
     * Delete jobs whose TTL has passed (issue #60). Covers artifacts too via
     * {@link #delete}. Non-terminal expired jobs are logged — with the V2
     * per-job timeouts far below the TTL this indicates something got stuck.
     */
    @Override
    public int deleteExpired(long nowMillis) {
        int reaped = 0;
        for (JobRecord job : listAll()) {
            if (job.expiresAt() > 0 && job.expiresAt() < nowMillis) {
                if (!job.isTerminal()) {
                    log.warn("Reaping expired job {} that never reached a terminal state (was {})",
                            job.jobId(), job.status());
                }
                delete(job.jobId());
                reaped++;
            }
        }
        return reaped;
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
