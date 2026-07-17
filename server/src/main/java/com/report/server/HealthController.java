package com.report.server;

import com.report.server.job.JobRecord;
import com.report.server.job.JobStatus;
import com.report.server.job.JobStore;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Detailed health and metrics endpoints for operators (admin-only).
 *
 * <ul>
 *   <li>GET /api/v1/admin/health  — ScalarDB connectivity, job-queue backlog, jobs-disk headroom</li>
 *   <li>GET /api/v1/admin/metrics — process-lifetime counters (PDF, jobs, rate-limit trips)</li>
 * </ul>
 *
 * <p>The lightweight public liveness probes ({@code GET /api/v1/health} → {@code {"status":"ok"}}
 * and {@code GET /api/v2/health} → 204) are intentionally left untouched for external monitors.
 * This endpoint exposes internal state (namespaces, disk paths) and so is gated behind the
 * {@code /api/v1/admin/*} role filter.
 */
public final class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    /** Namespace probed for a cheap ScalarDB round-trip. */
    private static final String PROBE_NAMESPACE = "report_studio";

    /** Backlog (PENDING + PROCESSING) at or above this marks the system DEGRADED. */
    static final int QUEUE_BACKLOG_DEGRADED = 100;
    /** Absolute usable-space floor (512 MiB) for the jobs disk before DEGRADED. */
    static final long DISK_FREE_DEGRADED_BYTES = 512L * 1024 * 1024;
    /** Fractional usable-space floor (10%) for the jobs disk before DEGRADED. */
    static final double DISK_FREE_DEGRADED_RATIO = 0.10;

    private final TransactionFactory factory;
    private final JobStore jobStore;
    private final Path jobsRoot;
    private final Metrics metrics;

    public HealthController(TransactionFactory factory, JobStore jobStore, Path jobsRoot, Metrics metrics) {
        this.factory = factory;
        this.jobStore = jobStore;
        this.jobsRoot = jobsRoot;
        this.metrics = metrics;
    }

    /** GET /api/v1/admin/health — detailed component health. Returns 503 when DOWN. */
    public void detailed(Context ctx) {
        Map<String, Object> scalardb = checkScalarDb();
        Map<String, Object> jobs = checkJobQueue();
        Map<String, Object> disk = checkJobsDisk();

        boolean down = "down".equals(scalardb.get("status"));
        boolean degraded = Boolean.TRUE.equals(jobs.get("degraded"))
                || Boolean.TRUE.equals(disk.get("degraded"));
        String status = down ? "DOWN" : (degraded ? "DEGRADED" : "UP");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status);
        body.put("uptimeMillis", metrics.uptimeMillis());
        body.put("scalardb", scalardb);
        body.put("jobs", jobs);
        body.put("disk", disk);

        ctx.status(down ? 503 : 200).json(body);
    }

    /** GET /api/v1/admin/metrics — process-lifetime counters. */
    public void metrics(Context ctx) {
        ctx.json(metrics.snapshot());
    }

    // ── Component checks ────────────────────────────────────────────────────────

    private Map<String, Object> checkScalarDb() {
        Map<String, Object> result = new LinkedHashMap<>();
        long t0 = System.nanoTime();
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            admin.namespaceExists(PROBE_NAMESPACE); // cheap metadata round-trip
            result.put("status", "up");
            result.put("latencyMillis", (System.nanoTime() - t0) / 1_000_000);
        } catch (Exception e) {
            log.warn("Health check: ScalarDB probe failed", e);
            result.put("status", "down");
            result.put("error", e.getClass().getSimpleName());
        }
        return result;
    }

    private Map<String, Object> checkJobQueue() {
        long pending = 0;
        long processing = 0;
        try {
            List<JobRecord> all = jobStore.listAll();
            for (JobRecord job : all) {
                JobStatus s = job.statusEnum();
                if (s == JobStatus.PENDING) pending++;
                else if (s == JobStatus.PROCESSING) processing++;
            }
        } catch (Exception e) {
            log.warn("Health check: job-queue inspection failed", e);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", e.getClass().getSimpleName());
            err.put("degraded", true);
            return err;
        }
        long backlog = pending + processing;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pending", pending);
        result.put("processing", processing);
        result.put("backlog", backlog);
        result.put("degraded", backlog >= QUEUE_BACKLOG_DEGRADED);
        return result;
    }

    private Map<String, Object> checkJobsDisk() {
        Map<String, Object> result = new LinkedHashMap<>();
        File dir = jobsRoot.toFile();
        long usable = dir.getUsableSpace();
        long total = dir.getTotalSpace();
        // getUsableSpace/getTotalSpace return 0 for a non-existent path — treat as unknown, not degraded.
        boolean unknown = total == 0;
        double freeRatio = total > 0 ? (double) usable / total : 1.0;
        boolean degraded = !unknown
                && (usable < DISK_FREE_DEGRADED_BYTES || freeRatio < DISK_FREE_DEGRADED_RATIO);

        result.put("path", jobsRoot.toString());
        result.put("usableBytes", usable);
        result.put("totalBytes", total);
        result.put("freeRatio", Math.round(freeRatio * 1000.0) / 1000.0);
        result.put("degraded", degraded);
        return result;
    }
}
