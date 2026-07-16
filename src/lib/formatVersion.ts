/**
 * Template envelope format versions (single source of truth).
 *
 * See docs/template-envelope-spec.md for the canonical envelope specification
 * and the migration ladder (v0 → v1 → v2).
 *
 * - v0: legacy `Report` JSON (no marker fields)
 * - v1: bare ReportDefinition with `$schema: "report-definition/v1"`
 * - v2: `{ formatVersion: 2, definition: ReportDefinition }` envelope
 *
 * `FORMAT_VERSION` is a monotonically increasing integer. Bump it when the
 * envelope or definition shape changes incompatibly, and add the corresponding
 * step to `MIGRATIONS` in migration.ts.
 */

/** Legacy v1 marker value (`$schema` field). */
export const SCHEMA_VERSION = 'report-definition/v1' as const

/** Current envelope format version. */
export const FORMAT_VERSION = 2 as const
