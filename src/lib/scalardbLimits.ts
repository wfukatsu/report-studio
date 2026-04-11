/**
 * ScalarDB table size limits — TypeScript mirror of ScalarDbLimits.java.
 *
 * Keep these values in sync with the Java constants. The frontend uses
 * them for client-side validation (before POST) so the user sees a cap
 * error before the server validates.
 *
 * Source of truth: server/src/main/java/com/report/server/ScalarDbLimits.java
 */

/** Maximum columns per table (matches V2SchemaInferController.MAX_FIELDS). */
export const MAX_COLUMNS_PER_TABLE = 200

/** Maximum number of partition key columns. */
export const MAX_PARTITION_KEYS = 16

/** Maximum number of clustering key columns. */
export const MAX_CLUSTERING_KEYS = 16

/** Maximum number of secondary index columns. */
export const MAX_SECONDARY_INDEXES = 32
