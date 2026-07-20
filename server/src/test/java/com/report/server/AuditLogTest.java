package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * {@link AuditLog#op} is a fire-and-forget SLF4J helper — the contract is that it never throws
 * regardless of outcome ("created" → info, anything else → warn) or null-ish arguments, so a
 * logging problem can never fail the admin operation being audited.
 */
class AuditLogTest {

    @Test
    void op_createdOutcomeDoesNotThrow() {
        assertDoesNotThrow(
                () -> AuditLog.op("create_table", "user-1", "demo", "orders", "created", "abc123"));
    }

    @Test
    void op_nonCreatedOutcomeDoesNotThrow() {
        assertDoesNotThrow(
                () ->
                        AuditLog.op(
                                "create_table", "user-1", "demo", "orders", "conflict", "abc123"));
        assertDoesNotThrow(
                () ->
                        AuditLog.op(
                                "create_table",
                                "unknown",
                                "demo",
                                "orders",
                                "ddl_rejected",
                                "abc123"));
    }

    @Test
    void op_toleratesNullArguments() {
        assertDoesNotThrow(() -> AuditLog.op(null, null, null, null, null, null));
        assertDoesNotThrow(() -> AuditLog.op("evaluate", null, null, null, "created", null));
    }
}
