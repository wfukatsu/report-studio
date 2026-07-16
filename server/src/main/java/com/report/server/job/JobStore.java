package com.report.server.job;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * The single job abstraction shared by all job stacks (issue #60).
 *
 * <p>One contract for job metadata persistence and artifact placement:
 * metadata lives in ScalarDB ({@link JobRepository}), artifacts on the local
 * filesystem under {@code data/jobs/{jobId}/}. The V1 batch stack and both V2
 * stacks (single-PDF and batch) all run on this interface, which gives V2 jobs
 * the same restart resilience ({@code reconcileOrphans}) and TTL reaping as V1.
 */
public interface JobStore {

    /** Save or update a job record. Implementations must not throw on failure. */
    void save(JobRecord record);

    Optional<JobRecord> findById(String jobId);

    /** All jobs of every type, newest first. */
    List<JobRecord> listAll();

    /** Delete a job record and every artifact under its job directory. */
    void delete(String jobId);

    /** Root directory for a job's artifacts ({@code data/jobs/{jobId}}). */
    Path jobDir(String jobId);

    /** Per-row output directory ({@code data/jobs/{jobId}/output}). */
    Path getOutputDir(String jobId);

    /** ZIP artifact path ({@code data/jobs/{jobId}/output.zip}). */
    Path getOutputZipPath(String jobId);

    /**
     * Delete jobs whose {@code expiresAt} is set and in the past
     * (records + artifacts). Returns the number of jobs reaped.
     */
    int deleteExpired(long nowMillis);
}
