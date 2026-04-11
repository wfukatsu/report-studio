/**
 * ScalarDB binding types — Phase 1 of the schema-binding plan.
 *
 * Zod schemas are the source of truth; TypeScript types are derived via
 * `z.infer` so a rename in one place is a compile error in the other.
 *
 * Verified against ScalarDB 3.14.4's `com.scalar.db.io.DataType` enum by
 * inspecting the shipped jar during Phase 1 implementation. TIMESTAMP was
 * initially assumed present but does NOT exist in 3.14.4 — the union below
 * is the exact, verified set.
 *
 * See docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md
 */
import { z } from 'zod'
import type { SchemaFieldType } from './index'

// ---------------------------------------------------------------------------
// ScalarDbColumnType — mirrors com.scalar.db.io.DataType exactly (7 values)
// ---------------------------------------------------------------------------

export const ScalarDbColumnTypeSchema = z.enum([
  'BOOLEAN',
  'INT',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'TEXT',
  'BLOB',
])

export type ScalarDbColumnType = z.infer<typeof ScalarDbColumnTypeSchema>

// ---------------------------------------------------------------------------
// ScalarDbKeyType — the role of a column in the table's key structure.
//
// IMPORTANT: there is NO 'column' sentinel. A regular column is encoded as
// an absent `keyType` field (undefined), keeping the union semantically
// clean. The backend controller emits `keyType` only for PK/CK/IX columns.
// ---------------------------------------------------------------------------

export const ScalarDbKeyTypeSchema = z.enum([
  'partition',
  'clustering',
  'index',
])

export type ScalarDbKeyType = z.infer<typeof ScalarDbKeyTypeSchema>

// ---------------------------------------------------------------------------
// ScalarDbTableMeta — the binding target on a SchemaGroup.
// No `status` field: `tableMeta === undefined` encodes "unlinked".
// ---------------------------------------------------------------------------

export interface ScalarDbTableMeta {
  namespace: string
  tableName: string
}

// ---------------------------------------------------------------------------
// SchemaFieldType → ScalarDbColumnType mapping.
//
// Used by CreateTableForm to pre-populate column types from group fields, and
// by Phase 2's evaluate path to materialise fetched values.
//
// NOTE: `array` is intentionally excluded — an array field at the master level
// cannot map to a single ScalarDB column (detail groups bind to whole tables).
// The `Exclude<>` gives a compile-time error if SchemaFieldType gains a new case
// without this map being updated.
// ---------------------------------------------------------------------------

export const SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE: Readonly<
  Record<Exclude<SchemaFieldType, 'array'>, ScalarDbColumnType>
> = {
  string: 'TEXT',
  number: 'DOUBLE',
  boolean: 'BOOLEAN',
  // Epoch millis — aligns with how v2 already serialises dates in the JSON source.
  date: 'BIGINT',
  // Assume URL. BLOB is available as an override for true inline storage.
  image: 'TEXT',
}
