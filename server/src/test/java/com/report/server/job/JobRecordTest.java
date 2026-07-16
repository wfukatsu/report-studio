package com.report.server.job;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Serialization compatibility of the unified JobRecord (issue #60): rows
 * written before the unification lack the new fields and must still parse.
 */
class JobRecordTest {

    @Test
    void legacyJson_withoutNewFields_parsesAsV1Batch() throws Exception {
        String legacy = """
            {"jobId":"job-1","templateId":"t1","status":"COMPLETED",
             "totalItems":5,"processedItems":5,"failedItems":0,
             "errorMessage":null,"createdAt":1000,"updatedAt":2000,"completedAt":2000}""";
        JobRecord record = JobRecord.fromJson(legacy);
        assertEquals("job-1", record.jobId());
        assertTrue(record.isV1());
        assertNull(record.owner());
        assertEquals(0, record.expiresAt());
        assertTrue(record.isTerminal());
    }

    @Test
    void roundTrip_preservesUnifiedFields() throws Exception {
        JobRecord record = JobRecord.create("pjob-1", "t1", JobRecord.TYPE_V2_PDF, "alice", 1, 9999L);
        JobRecord parsed = JobRecord.fromJson(record.toJson());
        assertEquals(JobRecord.TYPE_V2_PDF, parsed.jobType());
        assertEquals("alice", parsed.owner());
        assertEquals(9999L, parsed.expiresAt());
        assertFalse(parsed.isV1());
        assertEquals(JobStatus.PENDING, parsed.statusEnum());
    }

    @Test
    void cancelledStatus_isTerminal() {
        JobRecord record = JobRecord.create("job-1", "t1", JobRecord.TYPE_V1_BATCH, null, 1, 0)
                .withStatus(JobRecord.CANCELLED);
        assertTrue(record.isTerminal());
        assertTrue(record.completedAt() > 0);
    }

    @Test
    void withArtifact_marksCompleted() {
        JobRecord record = JobRecord.create("pjob-1", "t1", JobRecord.TYPE_V2_PDF, null, 1, 0)
                .withArtifact("/tmp/output.pdf");
        assertEquals(JobStatus.COMPLETED, record.statusEnum());
        assertEquals("/tmp/output.pdf", record.artifactPath());
    }

    @Test
    void compatConstructor_defaultsToV1Batch() {
        JobRecord record = new JobRecord("job-1", "t1", JobRecord.PENDING,
                1, 0, 0, null, 1L, 1L, 0L);
        assertTrue(record.isV1());
        assertEquals(JobRecord.TYPE_V1_BATCH, record.jobType());
    }
}
