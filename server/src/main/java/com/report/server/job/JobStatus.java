package com.report.server.job;

import java.util.Locale;

/**
 * Unified job status vocabulary (issue #60).
 *
 * <p>Historically each job stack had its own strings: V1 used UPPERCASE
 * constants (plus a bare {@code "CANCELLED"} literal that was not terminal),
 * the V2 stacks used lowercase literals with no cancelled state. This enum is
 * the single source; the API layers keep their historical casing via
 * {@link #v1Name()} / {@link #v2Name()}.
 */
public enum JobStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
    CANCELLED;

    /** Terminal statuses never transition again ({@code CANCELLED} included). */
    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }

    /** V1 API representation (UPPERCASE). */
    public String v1Name() {
        return name();
    }

    /** V2 API representation (lowercase). */
    public String v2Name() {
        return name().toLowerCase(Locale.ROOT);
    }

    /**
     * Parse a status string in either casing. Unknown values map to
     * {@code PENDING} — the safest non-terminal interpretation for a record
     * whose vocabulary predates this enum.
     */
    public static JobStatus from(String value) {
        if (value == null) return PENDING;
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return PENDING;
        }
    }
}
