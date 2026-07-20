package com.report.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Canonical audit log helper for ScalarDB admin operations.
 *
 * <p>Emits a single SLF4J line per operation attempt. Using a shared helper ensures that all Phase
 * 1.5+ controllers produce identically-shaped log lines, making it easy to grep for a correlation
 * ID across phases.
 *
 * <p>Usage:
 *
 * <pre>{@code
 * AuditLog.op("create_table", principal, namespace, tableName, "created", correlationId);
 * AuditLog.op("create_table", principal, namespace, tableName, "conflict", correlationId);
 * }</pre>
 *
 * <p>Operations used so far:
 *
 * <ul>
 *   <li>{@code "create_table"} — Phase 1.5
 *   <li>{@code "evaluate"} — Phase 2 (future)
 *   <li>{@code "projection_write"} — Phase 2 (future)
 * </ul>
 */
public final class AuditLog {

    private static final Logger log = LoggerFactory.getLogger(AuditLog.class);

    private AuditLog() {}

    /**
     * Logs an audit entry for a ScalarDB admin operation.
     *
     * @param operation e.g. {@code "create_table"}, {@code "evaluate"}
     * @param userId the authenticated principal's user ID (or {@code "unknown"})
     * @param namespace the ScalarDB namespace involved
     * @param tableName the table name involved
     * @param outcome e.g. {@code "created"}, {@code "conflict"}, {@code "ddl_rejected"}
     * @param correlationId an 8-char ID linking this log entry to the response body
     */
    public static void op(
            String operation,
            String userId,
            String namespace,
            String tableName,
            String outcome,
            String correlationId) {

        if ("created".equals(outcome)) {
            log.info(
                    "AUDIT op={} user={} ns={} table={} outcome={} correlationId={}",
                    operation,
                    userId,
                    namespace,
                    tableName,
                    outcome,
                    correlationId);
        } else {
            log.warn(
                    "AUDIT op={} user={} ns={} table={} outcome={} correlationId={}",
                    operation,
                    userId,
                    namespace,
                    tableName,
                    outcome,
                    correlationId);
        }
    }
}
