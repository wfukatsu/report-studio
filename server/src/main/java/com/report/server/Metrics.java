package com.report.server;

import com.report.server.job.JobStatus;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Minimal in-process metrics registry — lightweight counters and timers exposed
 * by the admin metrics endpoint. Intentionally dependency-free (no Micrometer /
 * Prometheus): the goal is basic operational visibility for self-hosted adopters,
 * not a full metrics pipeline.
 *
 * <p>All counters are process-lifetime totals (reset on restart) and thread-safe.
 * Instrumentation call sites use the shared {@link #GLOBAL} instance; tests may
 * construct their own instance for isolation.
 */
public final class Metrics {

    /** Shared instance used by instrumentation call sites (PDF renderer, rate limiter, jobs). */
    public static final Metrics GLOBAL = new Metrics();

    private final long startMillis = System.currentTimeMillis();

    // ── PDF rendering ─────────────────────────────────────────────────────────
    private final AtomicLong pdfRenderCount = new AtomicLong();
    private final AtomicLong pdfRenderErrorCount = new AtomicLong();
    private final AtomicLong pdfRenderTotalMillis = new AtomicLong();
    private final AtomicLong pdfRenderLastMillis = new AtomicLong(-1);

    // ── Batch/PDF jobs ────────────────────────────────────────────────────────
    private final AtomicLong jobCompletedCount = new AtomicLong();
    private final AtomicLong jobFailedCount = new AtomicLong();
    private final AtomicLong jobCancelledCount = new AtomicLong();

    // ── Rate limiting ─────────────────────────────────────────────────────────
    private final AtomicLong rateLimitTripCount = new AtomicLong();

    /**
     * Record one PDF render.
     *
     * @param durationMillis wall-clock duration of the render
     * @param success        {@code true} if the render completed, {@code false} if it threw
     */
    public void recordPdfRender(long durationMillis, boolean success) {
        pdfRenderCount.incrementAndGet();
        if (!success) pdfRenderErrorCount.incrementAndGet();
        pdfRenderTotalMillis.addAndGet(Math.max(0, durationMillis));
        pdfRenderLastMillis.set(durationMillis);
    }

    /** Record a terminal job outcome. Non-terminal statuses are ignored. */
    public void recordJobOutcome(JobStatus status) {
        if (status == null) return;
        switch (status) {
            case COMPLETED -> jobCompletedCount.incrementAndGet();
            case FAILED -> jobFailedCount.incrementAndGet();
            case CANCELLED -> jobCancelledCount.incrementAndGet();
            default -> { /* PENDING / PROCESSING are not outcomes */ }
        }
    }

    /** Record one rejected request across any rate limiter (login, export, row writes, …). */
    public void recordRateLimitTrip() {
        rateLimitTripCount.incrementAndGet();
    }

    /** Milliseconds since this registry was created (≈ process uptime for {@link #GLOBAL}). */
    public long uptimeMillis() {
        return System.currentTimeMillis() - startMillis;
    }

    /** Immutable snapshot of all metrics as a nested, JSON-friendly map. */
    public Map<String, Object> snapshot() {
        long pdfCount = pdfRenderCount.get();
        long pdfTotal = pdfRenderTotalMillis.get();
        long pdfLast = pdfRenderLastMillis.get();

        Map<String, Object> pdf = new LinkedHashMap<>();
        pdf.put("count", pdfCount);
        pdf.put("errorCount", pdfRenderErrorCount.get());
        pdf.put("totalMillis", pdfTotal);
        pdf.put("avgMillis", pdfCount > 0 ? pdfTotal / pdfCount : 0L);
        pdf.put("lastMillis", pdfLast < 0 ? null : pdfLast);

        Map<String, Object> jobs = new LinkedHashMap<>();
        jobs.put("completed", jobCompletedCount.get());
        jobs.put("failed", jobFailedCount.get());
        jobs.put("cancelled", jobCancelledCount.get());

        Map<String, Object> rateLimit = new LinkedHashMap<>();
        rateLimit.put("trips", rateLimitTripCount.get());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("uptimeMillis", uptimeMillis());
        out.put("pdf", pdf);
        out.put("jobs", jobs);
        out.put("rateLimit", rateLimit);
        return out;
    }

    /** Reset every counter to zero. Test-only helper. */
    public void reset() {
        pdfRenderCount.set(0);
        pdfRenderErrorCount.set(0);
        pdfRenderTotalMillis.set(0);
        pdfRenderLastMillis.set(-1);
        jobCompletedCount.set(0);
        jobFailedCount.set(0);
        jobCancelledCount.set(0);
        rateLimitTripCount.set(0);
    }
}
