package com.report.server.job;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Scheduled TTL reclamation for expired jobs (issue #60).
 *
 * <p>Replaces the per-controller lazy eviction the V2 stacks used (which only ran on the next
 * submit, so orphaned artifacts could linger indefinitely on idle servers). Jobs opt into expiry
 * via {@code JobRecord.expiresAt}; V1 batch jobs keep {@code expiresAt = 0} (no TTL, explicit
 * DELETE only).
 */
public final class JobTtlReaper implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(JobTtlReaper.class);

    private final ScheduledExecutorService scheduler;

    public JobTtlReaper(JobStore store, long periodSeconds) {
        this.scheduler =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = new Thread(r, "job-ttl-reaper");
                            t.setDaemon(true);
                            return t;
                        });
        scheduler.scheduleAtFixedRate(
                () -> {
                    try {
                        int reaped = store.deleteExpired(System.currentTimeMillis());
                        if (reaped > 0) log.info("Reaped {} expired job(s)", reaped);
                    } catch (Exception e) {
                        log.warn("Job TTL reap failed: {}", e.getMessage());
                    }
                },
                periodSeconds,
                periodSeconds,
                TimeUnit.SECONDS);
    }

    @Override
    public void close() {
        scheduler.shutdownNow();
    }
}
