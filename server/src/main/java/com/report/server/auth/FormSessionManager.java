package com.report.server.auth;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/**
 * Manages form access sessions (password-protected public forms). Sessions are stored in-memory
 * with a 1-hour TTL.
 */
public final class FormSessionManager {

    private static final long SESSION_TTL_MS = 3_600_000L; // 1 hour
    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final long EVICTION_INTERVAL_MINUTES = 30;

    private record Session(String templateId, long expiresAt) {}

    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService evictionScheduler;
    private final LongSupplier clock;

    public FormSessionManager() {
        this(System::currentTimeMillis);
    }

    /** Package-private for tests — inject a controllable clock. */
    FormSessionManager(LongSupplier clock) {
        this.clock = clock;
        evictionScheduler =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = Thread.ofVirtual().unstarted(r);
                            t.setName("form-session-eviction");
                            t.setDaemon(true);
                            return t;
                        });
        evictionScheduler.scheduleAtFixedRate(
                this::cleanExpired,
                EVICTION_INTERVAL_MINUTES,
                EVICTION_INTERVAL_MINUTES,
                TimeUnit.MINUTES);
    }

    /** Graceful shutdown — call from AppWiring.shutdown(). */
    public void shutdown() {
        evictionScheduler.shutdown();
        try {
            if (!evictionScheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                evictionScheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            evictionScheduler.shutdownNow();
        }
    }

    /**
     * Create a new session for the given template.
     *
     * @return a secure random token
     */
    public String createSession(String templateId) {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(token, new Session(templateId, clock.getAsLong() + SESSION_TTL_MS));
        return token;
    }

    /**
     * Validate a session token.
     *
     * @return the templateId if valid and not expired, null otherwise
     */
    public String validateSession(String token) {
        if (token == null) return null;
        Session session = sessions.get(token);
        if (session == null) return null;
        if (clock.getAsLong() > session.expiresAt()) {
            sessions.remove(token);
            return null;
        }
        return session.templateId();
    }

    /** Remove expired sessions. Called by the background scheduler. */
    void cleanExpired() {
        long now = clock.getAsLong();
        sessions.entrySet().removeIf(e -> now > e.getValue().expiresAt());
    }
}
