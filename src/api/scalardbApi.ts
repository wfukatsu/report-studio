/**
 * ScalarDB API — catalog, table creation, catalog TTL cache, binding
 * resolution (resolve-bindings), table scan, and row CRUD.
 */
import { z } from 'zod'
import { apiFetch } from './client'
import { jsonBody } from './apiHelpers'
import { ScalarDbColumnTypeSchema, ScalarDbKeyTypeSchema } from '@/types/scalardb'
import type { ScalarDbColumnType } from '@/types/scalardb'

// ---------------------------------------------------------------------------
// ScalarDB catalog — Phase 1 schema binding
// ---------------------------------------------------------------------------
//
// Intentional divergence from sibling schemas in reportApi's modules: the new
// schemas use the Zod default (`.strip()`), NOT `.passthrough()`. These flow
// into typed store state where untyped drift is dangerous; see the Phase 1
// plan's Technical Considerations for rationale.

const ScalarDbColumnRespSchema = z.object({
  name: z.string(),
  type: ScalarDbColumnTypeSchema,
  keyType: ScalarDbKeyTypeSchema.optional(), // undefined = regular column
})

export const ScalarDbTableEntrySchema = z.object({
  /** Present in creation responses (POST /tables); absent in catalog responses. */
  namespace: z.string().optional(),
  name: z.string(),
  columns: z.array(ScalarDbColumnRespSchema),
})

const ScalarDbNamespaceEntrySchema = z.object({
  name: z.string(),
  tables: z.array(ScalarDbTableEntrySchema),
})

export const ScalarDbCatalogSchema = z.object({
  namespaces: z.array(ScalarDbNamespaceEntrySchema),
})

export type ScalarDbCatalog = z.infer<typeof ScalarDbCatalogSchema>
export type ScalarDbCatalogColumn = z.infer<typeof ScalarDbColumnRespSchema>
export type ScalarDbCatalogTable = z.infer<typeof ScalarDbTableEntrySchema>
export type ScalarDbCatalogNamespace = z.infer<typeof ScalarDbNamespaceEntrySchema>

// ---------------------------------------------------------------------------
// ScalarDB table creation — Phase 1.5
// ---------------------------------------------------------------------------

/**
 * Request body for `POST /api/v2/scalardb/tables`.
 *
 * NOTE: Request types in the API modules follow the `*Request` convention for
 * HTTP wire formats only. Do NOT use `*Request` for store actions or React props.
 */
export interface CreateScalarDbTableRequest {
  namespace: string
  tableName: string
  columns: Array<{
    name: string
    type: ScalarDbColumnType
  }>
  partitionKeys: string[]
  clusteringKeys: string[]
  secondaryIndexes: string[]
}

/**
 * Create a new ScalarDB table from the given request and return the resulting
 * table metadata (re-read from disk, so the response reflects reality).
 *
 * Validates the response body with `ScalarDbTableEntrySchema`. Throws
 * `ApiError` for HTTP errors (400/409/401/403/500/503) and `NetworkError`
 * when the fetch itself fails.
 *
 * @param request - Table definition. Validated server-side and client-side.
 * @param signal  - Optional AbortSignal for cancellation on unmount.
 */
export async function createScalarDbTable(
  request: CreateScalarDbTableRequest,
  signal?: AbortSignal,
): Promise<ScalarDbCatalogTable> {
  return apiFetch(
    '/api/v2/scalardb/tables',
    ScalarDbTableEntrySchema,
    { ...jsonBody(request), signal },
  )
}

/**
 * Fetch the full ScalarDB catalog (namespaces → tables → columns) in one round-trip.
 *
 * Returns data that is immediately safe to render into `<select>` options —
 * every field is strictly validated against the Zod schema before reaching the
 * caller. Failures during the fetch will throw `ApiError` (HTTP 503 when
 * ScalarDB is unreachable) or `NetworkError` (when the fetch itself fails).
 *
 * @param signal - optional AbortSignal propagated to `fetch` for clean cancellation
 */
export async function fetchScalarDbCatalog(signal?: AbortSignal): Promise<ScalarDbCatalog> {
  return apiFetch('/api/v2/scalardb/catalog', ScalarDbCatalogSchema, { signal })
}

// ---------------------------------------------------------------------------
// ScalarDB catalog TTL cache (#214)
// ---------------------------------------------------------------------------

const CATALOG_TTL_MS = 5 * 60 * 1000  // 5 minutes

let _catalogCache: { data: ScalarDbCatalog; fetchedAt: number } | null = null

/**
 * fetchScalarDbCatalog with 5-minute module-level TTL cache.
 * Prevents redundant re-fetches when the DbConnection modal is unmounted
 * and remounted within a short period.
 *
 * Pass `force=true` to bypass the cache (e.g. user clicks "再取得").
 */
export async function fetchScalarDbCatalogCached(
  signal?: AbortSignal,
  force = false,
): Promise<ScalarDbCatalog> {
  if (!force && _catalogCache && Date.now() - _catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return _catalogCache.data
  }
  const data = await fetchScalarDbCatalog(signal)
  _catalogCache = { data, fetchedAt: Date.now() }
  return data
}

/** Invalidate the catalog cache (call after creating/modifying tables). */
export function invalidateScalarDbCatalogCache(): void {
  _catalogCache = null
}

// ---------------------------------------------------------------------------
// Phase 2: resolve-bindings — fetch actual ScalarDB row data
// ---------------------------------------------------------------------------

/**
 * Response from POST /api/v2/templates/{id}/resolve-bindings.
 * HTTP 207 (partial success): resolved contains per-group field values,
 * errors contains per-group error messages (null = no error for that group).
 */
type ComputedValueUnion = string | number | boolean | null

/**
 * A single group value in the resolve-bindings response.
 * - master groups → flat object: Record<fieldKey, value>
 * - detail groups (Phase 2.5) → array: Array<Record<fieldKey, value>>
 */
type ResolvedGroupValue =
  | Record<string, ComputedValueUnion>
  | Array<Record<string, ComputedValueUnion>>

export interface ResolveBindingsResponse {
  /**
   * master groups: single flat row { fieldKey → value }
   * detail groups: array of rows [ { fieldKey → value }, ... ]
   */
  resolved: Record<string, ResolvedGroupValue>
  /**
   * Per-group outcome: a diagnostic string when the group FAILED, or `null` when
   * it resolved successfully. The server writes an explicit `null` for every
   * successful group (BindingResolveController#putNull), so this map is keyed by
   * every requested group — not only the failing ones. Consumers must treat
   * `null` as "no error". (#387)
   */
  errors: Record<string, string | null>
  requestId?: string
}

const ComputedValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const ResolvedFlatRowSchema = z.record(z.string(), ComputedValueSchema)

/** Per-group value: either a single flat row (master) or an array of rows (detail). */
const ResolvedGroupValueSchema = z.union([
  ResolvedFlatRowSchema,
  z.array(ResolvedFlatRowSchema),
])

const ResolveBindingsResponseSchema = z.object({
  resolved: z.record(z.string(), ResolvedGroupValueSchema),
  // `null` = group resolved with no error; a string = failure message. The
  // server emits an explicit null per successful group, so requiring a string
  // here rejected every successful 207 response (#387).
  errors: z.record(z.string(), z.string().nullable()),
  requestId: z.string().optional(),
}) satisfies z.ZodType<ResolveBindingsResponse>

export interface ResolveBindingsRequest {
  schema: {
    groups: Array<{
      id: string
      role: string
      tableMeta?: { namespace: string; tableName: string }
      fields: Array<{ id: string; key: string; dbColumnName?: string }>
    }>
    /** #144: named relation objects — drives per-row product lookup enrichment. */
    relations?: Array<{
      id: string
      name: string
      from: string
      to: string
      on: { fromColumn: string; toColumn: string }
      kind: 'lookup' | 'master-detail'
    }>
  }
  /** Partition key values per group: { groupId → { columnName → value } } */
  partitionKeys: Record<string, Record<string, string>>
}

/**
 * POST /api/v2/templates/{id}/resolve-bindings
 *
 * Fetches actual row data from ScalarDB for schema groups that have tableMeta bound.
 * Returns HTTP 207 (partial success): groups that fail appear in `errors`.
 *
 * @param templateId - the template ID (for ownership verification)
 * @param request    - schema groups + partition key values to look up
 * @param signal     - optional AbortSignal for cancellation
 */
export async function resolveBindings(
  templateId: string,
  request: ResolveBindingsRequest,
  signal?: AbortSignal,
): Promise<ResolveBindingsResponse> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/resolve-bindings`,
    ResolveBindingsResponseSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    },
  )
}

// ---------------------------------------------------------------------------
// Data Browser — ScalarDB table scan
// ---------------------------------------------------------------------------

const ScalarDbColumnMetaSchema = z.object({
  name: z.string(),
  type: z.string(),
  keyType: z.string().optional(),
})

export const ScalarDbScanResponseSchema = z.object({
  columns: z.array(ScalarDbColumnMetaSchema),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  total: z.number().int(),
  truncated: z.boolean(),
  offset: z.number().int(),
  limit: z.number().int(),
})

export type ScalarDbColumnMeta = z.infer<typeof ScalarDbColumnMetaSchema>
export type ScalarDbScanResponse = z.infer<typeof ScalarDbScanResponseSchema>

/** GET /api/v2/scalardb/tables/{ns}/{table}/rows */
export async function scanScalarDbTable(
  namespace: string,
  table: string,
  params: { offset?: number; limit?: number } = {},
): Promise<ScalarDbScanResponse> {
  const qs = new URLSearchParams({
    offset: String(params.offset ?? 0),
    limit: String(params.limit ?? 50),
  })
  return apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows?${qs}`,
    ScalarDbScanResponseSchema,
  ) as Promise<ScalarDbScanResponse>
}

// ---------------------------------------------------------------------------
// ScalarDB Row CRUD
// ---------------------------------------------------------------------------

export type ScalarDbRowValues = Record<string, string | number | boolean | null>

const ScalarDbRowResponseSchema = z.object({
  row: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

/** POST /api/v2/scalardb/tables/{ns}/{table}/rows — insert row */
export async function insertScalarDbRow(
  namespace: string, table: string, values: ScalarDbRowValues,
): Promise<{ row: ScalarDbRowValues }> {
  return apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows`,
    ScalarDbRowResponseSchema,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) },
  )
}

/** PUT /api/v2/scalardb/tables/{ns}/{table}/rows — upsert (partial update) */
export async function updateScalarDbRow(
  namespace: string, table: string, values: ScalarDbRowValues,
): Promise<{ row: ScalarDbRowValues }> {
  return apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows`,
    ScalarDbRowResponseSchema,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) },
  )
}

/** DELETE /api/v2/scalardb/tables/{ns}/{table}/rows — physical delete */
export async function deleteScalarDbRow(
  namespace: string, table: string, keys: ScalarDbRowValues,
): Promise<void> {
  await apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows`,
    z.any(),
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) },
  )
}
