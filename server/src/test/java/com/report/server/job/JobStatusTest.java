package com.report.server.job;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class JobStatusTest {

    @Test
    void terminalStatuses_includeCancelled() {
        assertTrue(JobStatus.COMPLETED.isTerminal());
        assertTrue(JobStatus.FAILED.isTerminal());
        assertTrue(JobStatus.CANCELLED.isTerminal());
        assertFalse(JobStatus.PENDING.isTerminal());
        assertFalse(JobStatus.PROCESSING.isTerminal());
    }

    @Test
    void casingAccessors_matchHistoricalVocabularies() {
        assertEquals("PENDING", JobStatus.PENDING.v1Name());
        assertEquals("pending", JobStatus.PENDING.v2Name());
        assertEquals("CANCELLED", JobStatus.CANCELLED.v1Name());
        assertEquals("cancelled", JobStatus.CANCELLED.v2Name());
    }

    @Test
    void from_parsesEitherCasing() {
        assertEquals(JobStatus.PROCESSING, JobStatus.from("PROCESSING"));
        assertEquals(JobStatus.PROCESSING, JobStatus.from("processing"));
        assertEquals(JobStatus.CANCELLED, JobStatus.from("CANCELLED"));
    }

    @Test
    void from_unknownOrNull_mapsToPending() {
        assertEquals(JobStatus.PENDING, JobStatus.from(null));
        assertEquals(JobStatus.PENDING, JobStatus.from("bogus"));
    }
}
