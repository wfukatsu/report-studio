/**
 * Report API — all V2 backend API calls.
 *
 * Design decisions:
 * - No services/ layer (DHH): async operations live here directly
 * - loadFromBackend is here (not in a separate service file)
 * - Zod validation on every response (ReportDefinitionSchema)
 * - full PUT only — no JSON Patch (YAGNI for single-user tool)
 * - generation counter prevents concurrent load overwrite
 */
import { z } from 'zod'
import { apiFetch, apiFetchBlobWithFilename, downloadBlob, isNetworkError } from './client'
import { ReportDefinitionSchema } from '@/lib/schemas/reportDefinition'
import type { ReportDefinitionInput } from '@/lib/schemas/reportDefinition'
import type { ReportDefinition, TenantInfo } from '@/types'
import { ScalarDbColumnTypeSchema, ScalarDbKeyTypeSchema } from '@/types/scalardb'
import type { ScalarDbColumnType } from '@/types/scalardb'
import {
  EvaluateResponseSchema,
  ValidateResponseSchema,
  type EvaluateResponse,
  type ValidateResponse,
} from '@/lib/schemas/evaluateResponse'
import {
  FormResponseSchema,
  FormResponseListSchema,
  SubmitResponseResultSchema,
  DuplicateReportResultSchema,
  type FormResponse,
  type FormResponseList,
} from '@/lib/schemas/formResponse'
import { useReportStore } from '@/store'

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const TemplateListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string().optional(),
  createdAt: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough()

const TemplateListSchema = z.object({
  items: z.array(TemplateListItemSchema),
  total: z.number(),
})

const VersionListItemSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
}).passthrough()

export type TemplateListItem = z.infer<typeof TemplateListItemSchema>
export type VersionListItem = z.infer<typeof VersionListItemSchema>

// ---------------------------------------------------------------------------
// Helper: JSON body init
// ---------------------------------------------------------------------------

function jsonBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function listReports(): Promise<{ items: TemplateListItem[]; total: number }> {
  return apiFetch('/api/v2/templates', TemplateListSchema)
}

export async function getReport(id: string): Promise<ReportDefinition> {
  return apiFetch(`/api/v2/templates/${encodeURIComponent(id)}`, ReportDefinitionSchema) as unknown as Promise<ReportDefinition>
}

export async function createReport(name: string): Promise<TemplateListItem> {
  return apiFetch('/api/v2/templates', TemplateListItemSchema, jsonBody({ name }))
}

export async function saveReport(id: string, definition: ReportDefinition): Promise<ReportDefinition> {
  return apiFetch(`/api/v2/templates/${encodeURIComponent(id)}`, ReportDefinitionSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  }) as unknown as Promise<ReportDefinition>
}

export async function deleteReport(id: string): Promise<void> {
  return apiFetch(`/api/v2/templates/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

export async function listVersions(templateId: string): Promise<VersionListItem[]> {
  return apiFetch(`/api/v2/templates/${encodeURIComponent(templateId)}/versions`, z.array(VersionListItemSchema))
}

export async function createVersion(templateId: string): Promise<VersionListItem> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/versions`,
    VersionListItemSchema,
    { method: 'POST' },
  )
}

export async function restoreVersion(templateId: string, versionId: string): Promise<void> {
  // Uses generation counter to prevent concurrent load overwrite
  return loadFromBackend(templateId, versionId)
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const MeSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  anonymous: z.boolean(),
})

export type Me = z.infer<typeof MeSchema>

export async function getMe(): Promise<Me> {
  return apiFetch('/api/v1/auth/me', MeSchema)
}

/** Fixed: was sending `email` — backend expects `userId` */
export async function login(userId: string, password: string): Promise<Me> {
  return apiFetch('/api/v1/auth/login', MeSchema, jsonBody({ userId, password }))
}

export async function logout(): Promise<void> {
  return apiFetch('/api/v1/auth/logout', z.undefined(), { method: 'POST' })
}

export async function changeProfile(patch: {
  displayName?: string
  currentPassword?: string
  newPassword?: string
}): Promise<Me> {
  return apiFetch('/api/v1/auth/change-profile', MeSchema, jsonBody(patch))
}

// ---------------------------------------------------------------------------
// Admin user management
// ---------------------------------------------------------------------------

const UserSummarySchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
})
export type UserSummary = z.infer<typeof UserSummarySchema>

const UserListSchema = z.object({ users: z.array(UserSummarySchema) })

export async function listUsers(): Promise<UserSummary[]> {
  const res = await apiFetch('/api/v1/admin/users', UserListSchema)
  return res.users
}

export async function createUser(user: {
  userId: string
  displayName?: string
  password: string
  roles?: string[]
}): Promise<UserSummary> {
  return apiFetch('/api/v1/admin/users', UserSummarySchema, jsonBody(user))
}

export async function updateUser(
  userId: string,
  patch: { displayName?: string; password?: string; roles?: string[] },
): Promise<UserSummary> {
  return apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, UserSummarySchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function deleteUser(userId: string): Promise<void> {
  return apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, z.undefined(), {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Admin server config
// ---------------------------------------------------------------------------

const ServerConfigSchema = z.record(z.string(), z.string())
export type ServerConfig = z.infer<typeof ServerConfigSchema>

export async function getServerConfig(): Promise<ServerConfig> {
  return apiFetch('/api/v1/admin/server-config', ServerConfigSchema)
}

export async function putServerConfig(config: ServerConfig): Promise<{ message: string }> {
  return apiFetch('/api/v1/admin/server-config', z.object({ message: z.string() }), jsonBody(config))
}

export async function testServerConfig(config: ServerConfig): Promise<{ success: boolean; message: string }> {
  return apiFetch(
    '/api/v1/admin/server-config/test',
    z.object({ success: z.boolean(), message: z.string() }),
    jsonBody(config),
  )
}

export async function restartServer(): Promise<{ message: string }> {
  return apiFetch('/api/v1/admin/server/restart', z.object({ message: z.string() }), {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<boolean> {
  try {
    await apiFetch('/api/v2/health', z.undefined())
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate calculation rules against testData.
 * Call from useEvaluator only — this function does NOT touch the store.
 * Pass signal to cancel in-flight requests when deps change.
 */
export async function evaluateCalculations(
  templateId: string,
  definition: ReportDefinitionInput,
  testData: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<EvaluateResponse> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/evaluate`,
    EvaluateResponseSchema,
    { ...jsonBody({ definition, testData }), signal },
  )
}

/**
 * Validate the report against validation rules.
 * Called by Toolbar.handleValidate() when the user clicks the Validate button.
 */
export async function evaluateValidate(
  templateId: string,
  definition: ReportDefinitionInput,
  testData: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ValidateResponse> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/validate`,
    ValidateResponseSchema,
    { ...jsonBody({ definition, testData }), signal },
  )
}

// ---------------------------------------------------------------------------
// loadFromBackend — concurrent load prevention via generation counter
//
// The generation counter lives inside the store (not module scope) so:
// - Tests don't leak state between runs
// - Zustand devtools can observe it
// ---------------------------------------------------------------------------

/**
 * Load a template from the backend into the store.
 * If a version ID is provided, loads that specific snapshot.
 *
 * Race condition prevention:
 * - Increments loadGeneration before the fetch
 * - If generation has changed by the time the fetch completes, discards result
 *   (a newer load won the race and its result should be kept)
 */
export async function loadFromBackend(templateId: string, versionId?: string): Promise<void> {
  useReportStore.getState().incrementLoadGeneration()
  const generation = useReportStore.getState().loadGeneration
  useReportStore.getState().setLoadState('loading')

  try {
    const url = versionId
      ? `/api/v2/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/restore`
      : `/api/v2/templates/${encodeURIComponent(templateId)}`

    const method = versionId ? 'POST' : undefined
    const raw = await apiFetch(url, ReportDefinitionSchema, method ? { method } : undefined)

    // Discard if a newer load has already started
    if (generation !== useReportStore.getState().loadGeneration) return

    useReportStore.getState().loadReport(raw as unknown as ReportDefinition)
    useReportStore.getState().setCurrentTemplateId(templateId)
    useReportStore.getState().setBackendConnected(true)
    useReportStore.getState().setLoadState('idle')
    useReportStore.getState().invalidateComputed()
  } catch (err) {
    if (generation !== useReportStore.getState().loadGeneration) return
    if (isNetworkError(err)) useReportStore.getState().setBackendConnected(false)
    useReportStore.getState().setLoadState('error')
  }
}

// ---------------------------------------------------------------------------
// Form responses
// ---------------------------------------------------------------------------

export async function submitResponse(
  templateId: string,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses`,
    SubmitResponseResultSchema,
    jsonBody({ data }),
  )
}

export async function listResponses(
  templateId: string,
  opts: { offset?: number; limit?: number; aggregate?: boolean } = {},
): Promise<FormResponseList> {
  const params = new URLSearchParams({
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 50),
    ...(opts.aggregate ? { aggregate: 'true' } : {}),
  })
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses?${params}`,
    FormResponseListSchema,
  )
}

export async function getResponse(templateId: string, responseId: string): Promise<FormResponse> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}`,
    FormResponseSchema,
  )
}

export async function deleteResponse(templateId: string, responseId: string): Promise<void> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}`,
    z.undefined(),
    { method: 'DELETE' },
  )
}

export async function exportResponses(templateId: string, format: 'csv' | 'excel'): Promise<void> {
  const { blob, filename } = await apiFetchBlobWithFilename(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/export?format=${format}`,
  )
  downloadBlob(blob, filename)
}

export async function getResponsePdf(templateId: string, responseId: string): Promise<Blob> {
  const { blob } = await apiFetchBlobWithFilename(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}/pdf`,
  )
  return blob
}

// ---------------------------------------------------------------------------
// Template PDF generation (backend)
// ---------------------------------------------------------------------------

export async function generateTemplatePdf(
  templateId: string,
  testData?: Record<string, unknown>,
  variantId?: string,
): Promise<Blob> {
  const body: Record<string, unknown> = {}
  if (testData) body.testData = testData
  if (variantId) body.variantId = variantId
  const { blob } = await apiFetchBlobWithFilename(
    `/api/v2/templates/${encodeURIComponent(templateId)}/pdf`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  return blob
}

/**
 * Stateless PDF generation — sends the full template definition inline.
 * No server-side template storage required.
 */
export async function generateStatelessPdf(
  template: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<Blob> {
  const { blob } = await apiFetchBlobWithFilename(
    '/api/v2/pdf/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, data }),
    },
  )
  return blob
}

// ---------------------------------------------------------------------------
// Template duplication
// ---------------------------------------------------------------------------

export async function duplicateReport(id: string): Promise<{ id: string; name: string }> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(id)}/duplicate`,
    DuplicateReportResultSchema,
    { method: 'POST' },
  )
}

export async function listPublicReports(): Promise<{ items: TemplateListItem[]; total: number }> {
  return apiFetch('/api/v2/templates?visibility=public', TemplateListSchema)
}

export async function listSharedReports(): Promise<{ items: TemplateListItem[]; total: number }> {
  return apiFetch('/api/v2/templates?visibility=shared', TemplateListSchema)
}

export async function updateVisibility(id: string, visibility: 'private' | 'shared' | 'public'): Promise<{ id: string; visibility: string }> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(id)}/visibility`,
    z.object({ id: z.string(), visibility: z.string() }),
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility }) },
  )
}

export async function copyTemplate(id: string): Promise<{ id: string; name: string }> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(id)}/copy`,
    DuplicateReportResultSchema,
    { method: 'POST' },
  )
}

// ---------------------------------------------------------------------------
// Template export / import
// ---------------------------------------------------------------------------

export async function exportTemplate(id: string): Promise<{ blob: Blob; filename: string }> {
  return apiFetchBlobWithFilename(`/api/v2/templates/${encodeURIComponent(id)}/export`)
}

export async function importTemplate(fileContent: string): Promise<{ id: string; name: string }> {
  return apiFetch(
    '/api/v2/templates/import',
    DuplicateReportResultSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: fileContent,
    },
  )
}

// ---------------------------------------------------------------------------
// Template thumbnail
// ---------------------------------------------------------------------------

/** Returns the thumbnail URL for a template — can be used directly in <img src>. */
export function getTemplateThumbnailUrl(id: string): string {
  return `/api/v2/templates/${encodeURIComponent(id)}/thumbnail`
}

// ---------------------------------------------------------------------------
// Async PDF jobs
// ---------------------------------------------------------------------------

const PdfJobStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  error: z.string().optional(),
  statusUrl: z.string().optional(),
  resultUrl: z.string().optional(),
})

export type PdfJobStatus = z.infer<typeof PdfJobStatusSchema>

/**
 * Submit an async PDF generation job.
 * Returns immediately with jobId — poll getAsyncPdfJobStatus for completion.
 */
export async function submitAsyncPdfJob(
  templateId: string,
  testData?: Record<string, unknown>,
  variantId?: string,
): Promise<PdfJobStatus> {
  const body: Record<string, unknown> = { templateId }
  if (testData) body.testData = testData
  if (variantId) body.variantId = variantId
  return apiFetch('/api/v2/pdf-jobs', PdfJobStatusSchema, jsonBody(body))
}

/** Poll a job's status. */
export async function getAsyncPdfJobStatus(jobId: string): Promise<PdfJobStatus> {
  return apiFetch(`/api/v2/pdf-jobs/${encodeURIComponent(jobId)}`, PdfJobStatusSchema)
}

/** Download the completed PDF result. */
export async function downloadAsyncPdfResult(jobId: string): Promise<Blob> {
  const { blob } = await apiFetchBlobWithFilename(`/api/v2/pdf-jobs/${encodeURIComponent(jobId)}/result`)
  return blob
}

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------

import type { SchemaDefinition } from '@/types'

const SchemaDefinitionResponseSchema = z.object({
  groups: z.array(z.object({
    id: z.string(),
    label: z.string(),
    role: z.enum(['master', 'detail']),
    dataKey: z.string(),
    fields: z.array(z.object({
      id: z.string(),
      key: z.string(),
      label: z.string(),
      type: z.string(),
    })),
  })),
})

/**
 * Ask the backend to infer a SchemaDefinition from a JSON sample.
 * Useful for auto-generating schema from existing data.
 */
export async function inferSchema(sample: Record<string, unknown>): Promise<SchemaDefinition> {
  const result = await apiFetch('/api/v2/schemas/infer', SchemaDefinitionResponseSchema, jsonBody({ sample }))
  return result as unknown as SchemaDefinition
}

// ---------------------------------------------------------------------------
// ScalarDB catalog — Phase 1 schema binding
// ---------------------------------------------------------------------------
//
// Intentional divergence from sibling schemas in this file: the new schemas
// use the Zod default (`.strip()`), NOT `.passthrough()`. These flow into
// typed store state where untyped drift is dangerous; see the Phase 1 plan's
// Technical Considerations for rationale.

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
 * NOTE: Request types in reportApi.ts follow the `*Request` convention for
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
  errors: Record<string, string>
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
  errors: z.record(z.string(), z.string()),
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
// Tenant info
// ---------------------------------------------------------------------------

const TenantInfoSchema = z.object({
  companyName: z.string().optional(),
  postalCode: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  representativeName: z.string().optional(),
  logoBase64: z.string().optional(),
  custom: z.record(z.string(), z.string()).optional(),
})

/** GET /api/v2/tenant — returns {} when not yet configured */
export async function getTenantInfo(): Promise<TenantInfo> {
  return apiFetch('/api/v2/tenant', TenantInfoSchema) as Promise<TenantInfo>
}

/** PUT /api/v2/tenant — replaces entire tenant info document */
export async function putTenantInfo(info: TenantInfo): Promise<TenantInfo> {
  return apiFetch('/api/v2/tenant', TenantInfoSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info),
  }) as Promise<TenantInfo>
}

// ---------------------------------------------------------------------------
// Product Master
// ---------------------------------------------------------------------------

import {
  ProductSchema,
  ProductListSchema,
  ProductCustomFieldDefsSchema,
} from '@/lib/schemas/product'
import type { Product, ProductCustomFieldDef, CreateProductRequest, UpdateProductPayload } from '@/types'

/** Error thrown when a product code is already in use (409 Conflict). */
export class DuplicateCodeError extends Error {
  constructor() {
    super('この商品コードは既に使用されています')
    this.name = 'DuplicateCodeError'
  }
}

/** Error thrown on optimistic concurrency conflict (409 version mismatch). */
export class VersionConflictError extends Error {
  constructor() {
    super('他のユーザーが同じ商品を更新しました。最新データを確認してから再試行してください。')
    this.name = 'VersionConflictError'
  }
}

/** GET /api/v1/products — returns all active (non-deleted) products */
export async function getProducts(): Promise<Product[]> {
  return apiFetch('/api/v1/products', ProductListSchema) as Promise<Product[]>
}

/** GET /api/v1/products/{id} — returns a single product */
export async function getProduct(id: string): Promise<Product> {
  return apiFetch(`/api/v1/products/${encodeURIComponent(id)}`, ProductSchema) as Promise<Product>
}

/** POST /api/v1/products — creates a new product */
export async function createProduct(p: CreateProductRequest): Promise<Product> {
  const res = await fetch('/api/v1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
    credentials: 'include',
  })
  if (res.status === 409) throw new DuplicateCodeError()
  if (!res.ok) throw new Error(`POST /api/v1/products failed: ${res.status}`)
  return ProductSchema.parse(await res.json())
}

/** PUT /api/v1/products/{id} — updates an existing product */
export async function updateProduct(
  id: string,
  patch: UpdateProductPayload,
  expectedVersion: number,
): Promise<Product> {
  const res = await fetch(`/api/v1/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': String(expectedVersion),
    },
    body: JSON.stringify(patch),
    credentials: 'include',
  })
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    if ((body as { error?: string }).error === 'VERSION_CONFLICT') throw new VersionConflictError()
    throw new DuplicateCodeError()
  }
  if (!res.ok) throw new Error(`PUT /api/v1/products/${id} failed: ${res.status}`)
  return ProductSchema.parse(await res.json())
}

/** DELETE /api/v1/products/{id} — soft-deletes a product */
export async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/v1/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`DELETE /api/v1/products/${id} failed: ${res.status}`)
  }
}

/** GET /api/v1/products/fields — returns custom field definitions */
export async function getProductCustomFieldDefs(): Promise<ProductCustomFieldDef[]> {
  return apiFetch('/api/v1/products/fields', ProductCustomFieldDefsSchema) as Promise<ProductCustomFieldDef[]>
}

/** PUT /api/v1/products/fields — replaces custom field definitions */
export async function putProductCustomFieldDefs(
  defs: ProductCustomFieldDef[],
): Promise<ProductCustomFieldDef[]> {
  return apiFetch('/api/v1/products/fields', ProductCustomFieldDefsSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(defs),
  }) as Promise<ProductCustomFieldDef[]>
}

// ---------------------------------------------------------------------------
// Webhook Configuration
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  configured?: boolean
  url?: string
  secret?: string
}

export async function getWebhookConfig(templateId: string): Promise<WebhookConfig> {
  const res = await fetch(`/api/v1/webhooks/${encodeURIComponent(templateId)}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get webhook config: ${res.status}`)
  return res.json()
}

export async function updateWebhookConfig(templateId: string, config: WebhookConfig): Promise<WebhookConfig> {
  const res = await fetch(`/api/v1/webhooks/${encodeURIComponent(templateId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Failed: ${res.status}`)
  }
  return res.json()
}

export async function testWebhook(templateId: string): Promise<{ delivered: boolean; url: string }> {
  const res = await fetch(`/api/v1/webhooks/${encodeURIComponent(templateId)}/test`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Test failed: ${res.status}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Batch PDF Generation
// ---------------------------------------------------------------------------

export interface BatchPdfStatus {
  batchJobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total: number
  completed: number
  failed: number
  error?: string
}

export async function submitBatchPdfJob(
  templateId: string,
  responseIds: string[],
): Promise<{ batchJobId: string; totalCount: number; status: string; statusUrl: string }> {
  const res = await fetch('/api/v2/pdf-jobs/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, responseIds }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Batch job submit failed: ${res.status}`)
  return res.json()
}

export async function getBatchPdfStatus(batchJobId: string): Promise<BatchPdfStatus> {
  const res = await fetch(`/api/v2/pdf-jobs/batch/${encodeURIComponent(batchJobId)}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`)
  return res.json()
}

export async function downloadBatchPdfResult(batchJobId: string, filename: string): Promise<void> {
  const res = await fetch(`/api/v2/pdf-jobs/batch/${encodeURIComponent(batchJobId)}/result`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const blob = await res.blob()
  downloadBlob(blob, filename)
}

// ---------------------------------------------------------------------------
// Document Auto-numbering (シーケンス採番)
// ---------------------------------------------------------------------------

export interface SequenceConfig {
  configured?: boolean
  prefix?: string
  suffix?: string
  digits?: number
  resetOn?: 'year' | null
  counter?: number
}

export async function getSequenceConfig(templateId: string): Promise<SequenceConfig> {
  const res = await fetch(`/api/v1/sequences/${encodeURIComponent(templateId)}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get sequence config: ${res.status}`)
  return res.json()
}

export async function updateSequenceConfig(templateId: string, config: Partial<SequenceConfig>): Promise<SequenceConfig> {
  const res = await fetch(`/api/v1/sequences/${encodeURIComponent(templateId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to update sequence config: ${res.status}`)
  return res.json()
}

/** POST /api/v1/products/import — bulk import from CSV text */
export async function importProductsCsv(csvText: string): Promise<{
  imported: number
  skipped: number
  errors: { row: number; column: string; value: string; reason: string }[]
}> {
  const res = await fetch('/api/v1/products/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: csvText }),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Import failed: ${res.status}`)
  }
  return res.json()
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
