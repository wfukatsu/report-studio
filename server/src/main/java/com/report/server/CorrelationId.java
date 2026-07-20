package com.report.server;

import java.util.UUID;

/**
 * Generates short correlation IDs for error responses.
 *
 * <p>A correlation ID is the first 8 characters of a randomly generated UUID, included in error
 * response bodies so that a developer can cross-reference the server logs without exposing
 * sensitive exception details to the client.
 *
 * <p>Reused by all Phase 1.5+ controllers that call {@code AuditLog.op(...)}.
 */
public final class CorrelationId {

    private CorrelationId() {}

    /**
     * Generates a new random 8-character correlation ID.
     *
     * @return an 8-character hex-like string derived from a UUID
     */
    public static String generate() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }
}
