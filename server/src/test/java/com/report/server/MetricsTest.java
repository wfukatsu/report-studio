package com.report.server;

import com.report.server.job.JobStatus;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Unit tests for the in-process {@link Metrics} registry. */
class MetricsTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> section(Metrics m, String key) {
        return (Map<String, Object>) m.snapshot().get(key);
    }

    @Test
    void pdfRender_tracksCountErrorsTotalAvgAndLast() {
        Metrics m = new Metrics();
        m.recordPdfRender(100, true);
        m.recordPdfRender(300, false);

        Map<String, Object> pdf = section(m, "pdf");
        assertEquals(2L, pdf.get("count"));
        assertEquals(1L, pdf.get("errorCount"));
        assertEquals(400L, pdf.get("totalMillis"));
        assertEquals(200L, pdf.get("avgMillis"));
        assertEquals(300L, pdf.get("lastMillis"));
    }

    @Test
    void pdfRender_noData_avgZeroAndLastNull() {
        Metrics m = new Metrics();
        Map<String, Object> pdf = section(m, "pdf");
        assertEquals(0L, pdf.get("count"));
        assertEquals(0L, pdf.get("avgMillis"));
        assertNull(pdf.get("lastMillis"));
    }

    @Test
    void pdfRender_negativeDurationDoesNotReduceTotal() {
        Metrics m = new Metrics();
        m.recordPdfRender(-5, true); // clamped to 0 in the total
        assertEquals(0L, section(m, "pdf").get("totalMillis"));
    }

    @Test
    void jobOutcomes_countByTerminalStatusOnly() {
        Metrics m = new Metrics();
        m.recordJobOutcome(JobStatus.COMPLETED);
        m.recordJobOutcome(JobStatus.COMPLETED);
        m.recordJobOutcome(JobStatus.FAILED);
        m.recordJobOutcome(JobStatus.CANCELLED);
        m.recordJobOutcome(JobStatus.PENDING);     // ignored (not an outcome)
        m.recordJobOutcome(JobStatus.PROCESSING);  // ignored
        m.recordJobOutcome(null);                  // ignored

        Map<String, Object> jobs = section(m, "jobs");
        assertEquals(2L, jobs.get("completed"));
        assertEquals(1L, jobs.get("failed"));
        assertEquals(1L, jobs.get("cancelled"));
    }

    @Test
    void rateLimitTrips_counted() {
        Metrics m = new Metrics();
        m.recordRateLimitTrip();
        m.recordRateLimitTrip();
        assertEquals(2L, section(m, "rateLimit").get("trips"));
    }

    @Test
    void uptime_isPresentAndNonNegative() {
        Metrics m = new Metrics();
        Object uptime = m.snapshot().get("uptimeMillis");
        assertTrue(uptime instanceof Long && (Long) uptime >= 0);
    }

    @Test
    void reset_zeroesEveryCounter() {
        Metrics m = new Metrics();
        m.recordPdfRender(10, false);
        m.recordJobOutcome(JobStatus.COMPLETED);
        m.recordRateLimitTrip();

        m.reset();

        Map<String, Object> pdf = section(m, "pdf");
        assertEquals(0L, pdf.get("count"));
        assertEquals(0L, pdf.get("errorCount"));
        assertNull(pdf.get("lastMillis"));
        assertEquals(0L, section(m, "jobs").get("completed"));
        assertEquals(0L, section(m, "rateLimit").get("trips"));
    }
}
