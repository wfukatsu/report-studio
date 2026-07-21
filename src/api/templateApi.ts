/**
 * Template API — template CRUD, versions, evaluate/validate,
 * duplication/visibility, export/import, thumbnail, and loadFromBackend.
 */
import { z } from 'zod'
import { apiFetch, apiFetchBlobWithFilename, isNetworkError } from './client'
import { jsonBody } from './apiHelpers'
import { ReportDefinitionSchema } from '@/lib/schemas/reportDefinition'
import type { ReportDefinitionInput } from '@/lib/schemas/reportDefinition'
import { FORMAT_VERSION } from '@/lib/formatVersion'
import type { ReportDefinition } from '@/types'
import {
  EvaluateResponseSchema,
  ValidateResponseSchema,
  type EvaluateResponse,
  type ValidateResponse,
} from '@/lib/schemas/evaluateResponse'
import { DuplicateReportResultSchema } from '@/lib/schemas/formResponse'
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
  // The server list endpoint emits visibility (private|shared|public) and ownership
  // — model them so the management UI can display/act on them (#162). The API
  // accepts all three visibilities, so the type must include 'public' (previously
  // the list type only allowed private|shared, an inconsistency with updateVisibility).
  visibility: z.enum(['private', 'shared', 'public']).optional(),
  isOwner: z.boolean().optional(),
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

/**
 * Canonical template envelope (docs/template-envelope-spec.md):
 * `{ formatVersion, definition, ...server metadata }`.
 * Older servers respond with the bare definition, so template resource
 * responses are parsed as a union and unwrapped via `unwrapDefinition`.
 */
const TemplateEnvelopeSchema = z.object({
  formatVersion: z.number().int(),
  definition: ReportDefinitionSchema,
}).passthrough()

const TemplateResourceSchema = z.union([TemplateEnvelopeSchema, ReportDefinitionSchema])

function unwrapDefinition(resource: unknown): ReportDefinition {
  if (
    resource !== null &&
    typeof resource === 'object' &&
    'definition' in resource &&
    typeof (resource as Record<string, unknown>)['formatVersion'] === 'number'
  ) {
    return (resource as { definition: unknown }).definition as ReportDefinition
  }
  return resource as ReportDefinition
}

export type TemplateListItem = z.infer<typeof TemplateListItemSchema>
export type VersionListItem = z.infer<typeof VersionListItemSchema>

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function listReports(): Promise<{ items: TemplateListItem[]; total: number }> {
  return apiFetch('/api/v2/templates', TemplateListSchema)
}

export async function getReport(id: string): Promise<ReportDefinition> {
  const resource = await apiFetch(`/api/v2/templates/${encodeURIComponent(id)}`, TemplateResourceSchema)
  return unwrapDefinition(resource)
}

export async function createReport(name: string): Promise<TemplateListItem> {
  return apiFetch('/api/v2/templates', TemplateListItemSchema, jsonBody({ name }))
}

export async function saveReport(id: string, definition: ReportDefinition): Promise<ReportDefinition> {
  const resource = await apiFetch(`/api/v2/templates/${encodeURIComponent(id)}`, TemplateResourceSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    // Canonical envelope (docs/template-envelope-spec.md)
    body: JSON.stringify({ formatVersion: FORMAT_VERSION, definition }),
  })
  return unwrapDefinition(resource)
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
    const raw = await apiFetch(url, TemplateResourceSchema, method ? { method } : undefined)

    // Discard if a newer load has already started
    if (generation !== useReportStore.getState().loadGeneration) return

    useReportStore.getState().loadReport(unwrapDefinition(raw))
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
