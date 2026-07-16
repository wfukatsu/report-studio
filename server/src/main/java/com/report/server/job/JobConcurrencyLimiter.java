package com.report.server.job;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Unified admission control for job submission (issue #60).
 *
 * <p>Each job stack previously rolled its own counter with slightly different
 * (and in one case racy check-then-increment) semantics; one stack had no cap
 * at all. This is the single implementation: atomic acquire-or-reject, release
 * in the worker's {@code finally}.
 */
public final class JobConcurrencyLimiter {

    private final int maxActive;
    private final AtomicInteger active = new AtomicInteger(0);

    public JobConcurrencyLimiter(int maxActive) {
        this.maxActive = maxActive;
    }

    /** Atomically claim a slot. Returns false (no slot held) when saturated. */
    public boolean tryAcquire() {
        if (active.incrementAndGet() > maxActive) {
            active.decrementAndGet();
            return false;
        }
        return true;
    }

    /** Release a slot claimed by {@link #tryAcquire}. */
    public void release() {
        active.decrementAndGet();
    }

    public int maxActive() {
        return maxActive;
    }

    public int active() {
        return active.get();
    }
}
