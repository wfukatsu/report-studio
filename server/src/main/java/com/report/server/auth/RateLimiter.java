package com.report.server.auth;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * Fixed-window rate limiter with automatic cleanup of expired entries.
 * Allows a maximum number of attempts per key within a time window.
 *
 * <p>Default: 5 attempts per 5 minutes per key (login / form-password use cases).
 * Pass custom values to the constructor for other use cases.
 */
public final class RateLimiter {

    /** Default: 5 attempts per 5-minute window (matches security policy). */
    private static final int DEFAULT_MAX_ATTEMPTS = 5;
    private static final long DEFAULT_WINDOW_MS = 5 * 60 * 1000L; // 5 minutes

    private static final int CLEANUP_INTERVAL = 100; // clean every N calls

    private final int maxAttempts;
    private final long windowMs;
    private final LongSupplier clock;

    private record Window(int count, long windowStart) {}

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicLong callCount = new AtomicLong(0);

    /** Creates a rate limiter with the default policy: 5 attempts per 5 minutes. */
    public RateLimiter() {
        this(DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS);
    }

    /**
     * Creates a rate limiter with custom limits.
     *
     * @param maxAttempts maximum allowed attempts within the window
     * @param windowMs    window duration in milliseconds
     */
    public RateLimiter(int maxAttempts, long windowMs) {
        this(maxAttempts, windowMs, System::currentTimeMillis);
    }

    /** Package-private for tests — inject a controllable clock. */
    RateLimiter(int maxAttempts, long windowMs, LongSupplier clock) {
        if (maxAttempts <= 0) throw new IllegalArgumentException("maxAttempts must be > 0");
        if (windowMs <= 0) throw new IllegalArgumentException("windowMs must be > 0");
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
        this.clock = clock;
    }

    /**
     * Check if a request for the given key is allowed.
     * Increments the counter if allowed.
     *
     * @return true if allowed, false if rate limited
     */
    public boolean isAllowed(String key) {
        long now = clock.getAsLong();

        // Periodic cleanup of expired windows
        if (callCount.incrementAndGet() % CLEANUP_INTERVAL == 0) {
            cleanExpired(now);
        }

        Window current = windows.compute(key, (k, existing) -> {
            if (existing == null || now - existing.windowStart() >= windowMs) {
                return new Window(1, now);
            }
            return new Window(existing.count() + 1, existing.windowStart());
        });
        boolean allowed = current.count() <= maxAttempts;
        if (!allowed) {
            // Observability: count rejected requests across all limiters (login, export, row writes, …).
            com.report.server.Metrics.GLOBAL.recordRateLimitTrip();
        }
        return allowed;
    }

    /**
     * Clear the counter for the given key.
     *
     * <p>Used to forgive a key's accumulated attempts after a legitimate outcome —
     * e.g. a successful login — so that brute-force protection targets failed
     * attempts rather than throttling genuine users (notably several users behind
     * a shared/NAT IP).
     */
    public void reset(String key) {
        windows.remove(key);
    }

    /** Remove expired windows to prevent unbounded memory growth. */
    private void cleanExpired(long now) {
        windows.entrySet().removeIf(e -> now - e.getValue().windowStart() >= windowMs);
    }
}
