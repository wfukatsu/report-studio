package com.report.server;

/**
 * ScalarDB table size limits — mirrored in {@code src/lib/scalardbLimits.ts}.
 *
 * <p>Keep these values in sync with the TypeScript constants. The frontend
 * uses them for client-side validation (before POST); the backend uses them
 * for final server-side enforcement.
 */
public final class ScalarDbLimits {

    private ScalarDbLimits() {}

    /** Maximum columns per table. Matches SchemaInferController.MAX_FIELDS. */
    public static final int MAX_COLUMNS_PER_TABLE = 200;

    /** Maximum number of partition key columns. */
    public static final int MAX_PARTITION_KEYS = 16;

    /** Maximum number of clustering key columns. */
    public static final int MAX_CLUSTERING_KEYS = 16;

    /** Maximum number of secondary index columns. */
    public static final int MAX_SECONDARY_INDEXES = 32;

    /**
     * Maximum length for a ScalarDB identifier (namespace, table, or column name).
     *
     * <p>64 is a safe conservative cap for common backends. Cassandra limits
     * identifiers to 48 chars; most JDBC backends allow 63–128. The frontend
     * mirrors this constant in {@code scalardbLimits.ts} — keep them in sync.
     */
    public static final int MAX_IDENTIFIER_LENGTH = 64;
}
