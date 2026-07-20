package com.report.server.testsupport;

import com.report.server.job.JobRecord;
import com.report.server.job.JobStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Map-backed {@link JobStore} for controller tests — no ScalarDB, artifacts in a temp directory.
 */
public final class InMemoryJobStore implements JobStore {

    private final Map<String, JobRecord> jobs = new ConcurrentHashMap<>();
    private final Path root;

    public InMemoryJobStore() {
        try {
            this.root = Files.createTempDirectory("jobstore-test-");
        } catch (IOException e) {
            throw new UncheckedIOExceptionWrapper(e);
        }
    }

    @Override
    public void save(JobRecord record) {
        jobs.put(record.jobId(), record);
    }

    @Override
    public Optional<JobRecord> findById(String jobId) {
        return Optional.ofNullable(jobs.get(jobId));
    }

    @Override
    public List<JobRecord> listAll() {
        return jobs.values().stream()
                .sorted(Comparator.comparingLong(JobRecord::createdAt).reversed())
                .toList();
    }

    @Override
    public void delete(String jobId) {
        jobs.remove(jobId);
        deleteRecursively(jobDir(jobId));
    }

    @Override
    public Path jobDir(String jobId) {
        return root.resolve(jobId);
    }

    @Override
    public Path getOutputDir(String jobId) {
        return jobDir(jobId).resolve("output");
    }

    @Override
    public Path getOutputZipPath(String jobId) {
        return jobDir(jobId).resolve("output.zip");
    }

    @Override
    public int deleteExpired(long nowMillis) {
        int reaped = 0;
        for (JobRecord job : listAll()) {
            if (job.expiresAt() > 0 && job.expiresAt() < nowMillis) {
                delete(job.jobId());
                reaped++;
            }
        }
        return reaped;
    }

    private static void deleteRecursively(Path dir) {
        if (!Files.exists(dir)) return;
        try (var files = Files.walk(dir)) {
            files.sorted(Comparator.reverseOrder())
                    .forEach(
                            p -> {
                                try {
                                    Files.deleteIfExists(p);
                                } catch (IOException ignored) {
                                }
                            });
        } catch (IOException ignored) {
        }
    }

    private static final class UncheckedIOExceptionWrapper extends RuntimeException {
        UncheckedIOExceptionWrapper(IOException e) {
            super(e);
        }
    }
}
