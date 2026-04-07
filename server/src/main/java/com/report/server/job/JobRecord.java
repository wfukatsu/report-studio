package com.report.server.job;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;

/**
 * Immutable job metadata record. Stored as JSON in data/jobs/{jobId}/job.json.
 */
public record JobRecord(
    String jobId,
    String templateId,
    String status,       // PENDING, PROCESSING, COMPLETED, FAILED
    int totalItems,
    int processedItems,
    int failedItems,
    String errorMessage,
    long createdAt,
    long updatedAt,
    long completedAt
) {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final String PENDING = "PENDING";
    public static final String PROCESSING = "PROCESSING";
    public static final String COMPLETED = "COMPLETED";
    public static final String FAILED = "FAILED";

    public JobRecord withStatus(String newStatus) {
        return new JobRecord(jobId, templateId, newStatus, totalItems,
            processedItems, failedItems, errorMessage,
            createdAt, System.currentTimeMillis(),
            COMPLETED.equals(newStatus) || FAILED.equals(newStatus) ? System.currentTimeMillis() : completedAt);
    }

    public JobRecord withProgress(int processed, int failed) {
        return new JobRecord(jobId, templateId, status, totalItems,
            processed, failed, errorMessage,
            createdAt, System.currentTimeMillis(), completedAt);
    }

    public JobRecord withError(String error) {
        return new JobRecord(jobId, templateId, FAILED, totalItems,
            processedItems, failedItems, error,
            createdAt, System.currentTimeMillis(), System.currentTimeMillis());
    }

    public String toJson() throws IOException {
        return MAPPER.writeValueAsString(this);
    }

    public static JobRecord fromJson(String json) throws IOException {
        return MAPPER.readValue(json, JobRecord.class);
    }

    public boolean isTerminal() {
        return COMPLETED.equals(status) || FAILED.equals(status);
    }
}
