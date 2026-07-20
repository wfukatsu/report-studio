package com.report.server.job;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;

/**
 * Immutable job metadata record — the single record type for every job stack (issue #60). Stored as
 * JSON in ScalarDB table {@code report_studio.jobs}.
 *
 * <p>Fields added by the unification are tolerated as absent when reading records written before
 * it: {@code jobType} (null = V1 batch), {@code owner} (null = no ownership restriction), {@code
 * artifactPath}, and {@code expiresAt} (0 = no TTL).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record JobRecord(
        String jobId,
        String templateId,
        String status, // JobStatus vocabulary, stored in V1 (UPPERCASE) casing
        int totalItems,
        int processedItems,
        int failedItems,
        String errorMessage,
        long createdAt,
        long updatedAt,
        long completedAt,
        String jobType, // V1_BATCH / V2_PDF / V2_BATCH — null means V1_BATCH (legacy rows)
        String owner, // submitting user id, or null when unrestricted
        String artifactPath, // result artifact (absolute path), when not the conventional zip
        long expiresAt // epoch millis; 0 = never expires
        ) {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final String TYPE_V1_BATCH = "V1_BATCH";
    public static final String TYPE_V2_PDF = "V2_PDF";
    public static final String TYPE_V2_BATCH = "V2_BATCH";

    public static final String PENDING = JobStatus.PENDING.v1Name();
    public static final String PROCESSING = JobStatus.PROCESSING.v1Name();
    public static final String COMPLETED = JobStatus.COMPLETED.v1Name();
    public static final String FAILED = JobStatus.FAILED.v1Name();
    public static final String CANCELLED = JobStatus.CANCELLED.v1Name();

    /** Compatibility constructor with the pre-unification arity (V1 batch job). */
    public JobRecord(
            String jobId,
            String templateId,
            String status,
            int totalItems,
            int processedItems,
            int failedItems,
            String errorMessage,
            long createdAt,
            long updatedAt,
            long completedAt) {
        this(
                jobId,
                templateId,
                status,
                totalItems,
                processedItems,
                failedItems,
                errorMessage,
                createdAt,
                updatedAt,
                completedAt,
                TYPE_V1_BATCH,
                null,
                null,
                0);
    }

    /** Fresh PENDING record. */
    public static JobRecord create(
            String jobId,
            String templateId,
            String jobType,
            String owner,
            int totalItems,
            long expiresAt) {
        long now = System.currentTimeMillis();
        return new JobRecord(
                jobId,
                templateId,
                PENDING,
                totalItems,
                0,
                0,
                null,
                now,
                now,
                0,
                jobType,
                owner,
                null,
                expiresAt);
    }

    public JobStatus statusEnum() {
        return JobStatus.from(status);
    }

    /** True for V1 batch jobs, including legacy rows without {@code jobType}. */
    public boolean isV1() {
        return jobType == null || TYPE_V1_BATCH.equals(jobType);
    }

    public JobRecord withStatus(String newStatus) {
        boolean terminal = JobStatus.from(newStatus).isTerminal();
        return new JobRecord(
                jobId,
                templateId,
                newStatus,
                totalItems,
                processedItems,
                failedItems,
                errorMessage,
                createdAt,
                System.currentTimeMillis(),
                terminal ? System.currentTimeMillis() : completedAt,
                jobType,
                owner,
                artifactPath,
                expiresAt);
    }

    public JobRecord withStatus(JobStatus newStatus) {
        return withStatus(newStatus.v1Name());
    }

    public JobRecord withProgress(int processed, int failed) {
        return new JobRecord(
                jobId,
                templateId,
                status,
                totalItems,
                processed,
                failed,
                errorMessage,
                createdAt,
                System.currentTimeMillis(),
                completedAt,
                jobType,
                owner,
                artifactPath,
                expiresAt);
    }

    public JobRecord withError(String error) {
        return new JobRecord(
                jobId,
                templateId,
                FAILED,
                totalItems,
                processedItems,
                failedItems,
                error,
                createdAt,
                System.currentTimeMillis(),
                System.currentTimeMillis(),
                jobType,
                owner,
                artifactPath,
                expiresAt);
    }

    /** Mark completed with a result artifact path. */
    public JobRecord withArtifact(String path) {
        return new JobRecord(
                jobId,
                templateId,
                COMPLETED,
                totalItems,
                processedItems,
                failedItems,
                errorMessage,
                createdAt,
                System.currentTimeMillis(),
                System.currentTimeMillis(),
                jobType,
                owner,
                path,
                expiresAt);
    }

    public String toJson() throws IOException {
        return MAPPER.writeValueAsString(this);
    }

    public static JobRecord fromJson(String json) throws IOException {
        return MAPPER.readValue(json, JobRecord.class);
    }

    public boolean isTerminal() {
        return statusEnum().isTerminal();
    }
}
