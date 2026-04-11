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
import type { ReportDefinition } from '@/types'
import { ScalarDbColumnTypeSchema, ScalarDbKeyTypeSchema } from '@/types/scalardb'
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
  id: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
}).passthrough()

export type Me = z.infer<typeof MeSchema>

export async function getMe(): Promise<Me> {
  return apiFetch('/api/v1/auth/me', MeSchema)
}

export async function login(email: string, password: string): Promise<Me> {
  return apiFetch('/api/v1/auth/login', MeSchema, jsonBody({ email, password }))
}

export async function logout(): Promise<void> {
  return apiFetch('/api/v1/auth/logout', z.undefined(), { method: 'POST' })
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
    /** One of the 7 ScalarDB DataType values. */
    type: 'BOOLEAN' | 'INT' | 'BIGINT' | 'FLOAT' | 'DOUBLE' | 'TEXT' | 'BLOB'
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
