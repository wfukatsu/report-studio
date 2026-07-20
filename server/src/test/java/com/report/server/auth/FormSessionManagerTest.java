package com.report.server.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link FormSessionManager} — token issuance, validation and the 1-hour TTL. Time is
 * injected via the package-private clock seam.
 */
class FormSessionManagerTest {

    private static final long ONE_HOUR_MS = 3_600_000L;

    private final AtomicLong now = new AtomicLong(1_000_000L);
    private FormSessionManager manager;

    @BeforeEach
    void setUp() {
        manager = new FormSessionManager(now::get);
    }

    @AfterEach
    void tearDown() {
        manager.shutdown();
    }

    // ── Token issuance ───────────────────────────────────────────────────────

    @Test
    void createSessionReturnsUrlSafeToken() {
        String token = manager.createSession("tpl-1");

        assertNotNull(token);
        // 32 random bytes → 43 chars of unpadded URL-safe Base64
        assertEquals(43, token.length());
        assertTrue(token.matches("^[A-Za-z0-9_-]+$"), "token must be URL-safe Base64");
    }

    @Test
    void tokensAreUnique() {
        Set<String> tokens = new HashSet<>();
        for (int i = 0; i < 100; i++) {
            assertTrue(tokens.add(manager.createSession("tpl-1")), "duplicate token issued");
        }
    }

    // ── Validation ───────────────────────────────────────────────────────────

    @Test
    void validateReturnsTemplateIdForValidToken() {
        String token = manager.createSession("template-abc");

        assertEquals("template-abc", manager.validateSession(token));
    }

    @Test
    void validateReturnsNullForNullToken() {
        assertNull(manager.validateSession(null));
    }

    @Test
    void validateReturnsNullForUnknownToken() {
        manager.createSession("tpl-1");

        assertNull(manager.validateSession("no-such-token"));
    }

    @Test
    void sessionsAreIsolatedPerToken() {
        String t1 = manager.createSession("tpl-1");
        String t2 = manager.createSession("tpl-2");

        assertEquals("tpl-1", manager.validateSession(t1));
        assertEquals("tpl-2", manager.validateSession(t2));
    }

    // ── TTL expiry ───────────────────────────────────────────────────────────

    @Test
    void sessionValidJustBeforeOneHour() {
        String token = manager.createSession("tpl-1");

        now.addAndGet(ONE_HOUR_MS); // exactly at expiry boundary — still valid (strict >)
        assertEquals("tpl-1", manager.validateSession(token));
    }

    @Test
    void sessionExpiresAfterOneHour() {
        String token = manager.createSession("tpl-1");

        now.addAndGet(ONE_HOUR_MS + 1);
        assertNull(manager.validateSession(token), "session must expire after 1h TTL");
    }

    @Test
    void expiredSessionIsRemovedOnValidation() {
        String token = manager.createSession("tpl-1");

        now.addAndGet(ONE_HOUR_MS + 1);
        assertNull(manager.validateSession(token));

        // Even if the clock went backwards, the entry is gone
        now.addAndGet(-(ONE_HOUR_MS + 1));
        assertNull(manager.validateSession(token));
    }

    @Test
    void cleanExpiredEvictsOnlyExpiredSessions() {
        String oldToken = manager.createSession("tpl-old");
        now.addAndGet(ONE_HOUR_MS + 1);
        String freshToken = manager.createSession("tpl-fresh");

        manager.cleanExpired();

        // Rewind the clock: an evicted session stays gone, the fresh one survives
        now.addAndGet(-(ONE_HOUR_MS + 1));
        assertNull(manager.validateSession(oldToken), "expired session must be evicted");
        assertEquals("tpl-fresh", manager.validateSession(freshToken));
    }
}
