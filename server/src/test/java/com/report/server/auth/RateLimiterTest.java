package com.report.server.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link RateLimiter} — the fixed-window limiter guarding login and row-write endpoints.
 * Time is injected via the package-private clock seam so window expiry is deterministic.
 */
class RateLimiterTest {

    private static final long WINDOW_MS = 5 * 60 * 1000L;

    private final AtomicLong now = new AtomicLong(1_000_000L);

    private RateLimiter limiter(int maxAttempts) {
        return new RateLimiter(maxAttempts, WINDOW_MS, now::get);
    }

    // ── Constructor validation ───────────────────────────────────────────────

    @Test
    void rejectsNonPositiveMaxAttempts() {
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter(0, WINDOW_MS));
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter(-1, WINDOW_MS));
    }

    @Test
    void rejectsNonPositiveWindow() {
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter(5, 0));
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter(5, -1));
    }

    // ── Within-threshold allowance ───────────────────────────────────────────

    @Test
    void allowsUpToMaxAttempts() {
        RateLimiter rl = limiter(5);
        for (int i = 0; i < 5; i++) {
            assertTrue(rl.isAllowed("ip1"), "attempt " + (i + 1) + " should be allowed");
        }
    }

    @Test
    void rejectsAttemptsBeyondThreshold() {
        RateLimiter rl = limiter(5);
        for (int i = 0; i < 5; i++) rl.isAllowed("ip1");

        assertFalse(rl.isAllowed("ip1"), "6th attempt must be rejected");
        assertFalse(rl.isAllowed("ip1"), "7th attempt must stay rejected");
    }

    @Test
    void defaultPolicyAllowsFiveAttempts() {
        RateLimiter rl = new RateLimiter(); // 5 attempts / 5 min
        for (int i = 0; i < 5; i++) {
            assertTrue(rl.isAllowed("key"));
        }
        assertFalse(rl.isAllowed("key"));
    }

    // ── Key isolation ────────────────────────────────────────────────────────

    @Test
    void keysAreIndependent() {
        RateLimiter rl = limiter(2);
        assertTrue(rl.isAllowed("a"));
        assertTrue(rl.isAllowed("a"));
        assertFalse(rl.isAllowed("a"));

        // A different key still has a fresh budget
        assertTrue(rl.isAllowed("b"));
        assertTrue(rl.isAllowed("b"));
        assertFalse(rl.isAllowed("b"));
    }

    // ── Explicit reset (forgive on success) ──────────────────────────────────

    @Test
    void resetClearsTheKeysCounter() {
        RateLimiter rl = limiter(5);
        for (int i = 0; i < 5; i++) rl.isAllowed("ip");
        assertFalse(rl.isAllowed("ip"), "6th attempt rejected before reset");

        rl.reset("ip");

        // Full budget is available again after a reset (e.g. a successful login)
        for (int i = 0; i < 5; i++) {
            assertTrue(rl.isAllowed("ip"), "attempt " + (i + 1) + " should be allowed after reset");
        }
        assertFalse(rl.isAllowed("ip"));
    }

    @Test
    void resetOnlyAffectsTheGivenKey() {
        RateLimiter rl = limiter(2);
        rl.isAllowed("a");
        rl.isAllowed("b");
        rl.reset("a");

        // "a" forgiven → fresh budget; "b" untouched
        assertTrue(rl.isAllowed("a"));
        assertTrue(rl.isAllowed("a"));
        assertFalse(rl.isAllowed("a"));
        assertTrue(rl.isAllowed("b")); // b had 1 prior attempt, 2nd still allowed
        assertFalse(rl.isAllowed("b"));
    }

    @Test
    void resetOnUnknownKeyIsNoop() {
        RateLimiter rl = limiter(2);
        rl.reset("never-seen"); // must not throw
        assertTrue(rl.isAllowed("never-seen"));
        assertTrue(rl.isAllowed("never-seen"));
        assertFalse(rl.isAllowed("never-seen"));
    }

    // ── Window reset ─────────────────────────────────────────────────────────

    @Test
    void windowResetsAfterExpiry() {
        RateLimiter rl = limiter(3);
        for (int i = 0; i < 3; i++) assertTrue(rl.isAllowed("ip"));
        assertFalse(rl.isAllowed("ip"));

        // Advance exactly to the window boundary — a new window starts
        now.addAndGet(WINDOW_MS);
        assertTrue(rl.isAllowed("ip"), "attempt after window expiry must be allowed again");
    }

    @Test
    void stillRejectedJustBeforeWindowExpiry() {
        RateLimiter rl = limiter(3);
        for (int i = 0; i < 3; i++) rl.isAllowed("ip");

        now.addAndGet(WINDOW_MS - 1);
        assertFalse(rl.isAllowed("ip"), "must stay rejected 1ms before the window closes");
    }

    @Test
    void rejectedAttemptsDoNotExtendTheWindow() {
        RateLimiter rl = limiter(2);
        rl.isAllowed("ip");
        rl.isAllowed("ip");

        // Hammer while blocked — fixed window must still reset at windowStart + WINDOW_MS
        now.addAndGet(WINDOW_MS / 2);
        assertFalse(rl.isAllowed("ip"));

        now.addAndGet(WINDOW_MS / 2);
        assertTrue(rl.isAllowed("ip"));
    }
}
