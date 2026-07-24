/**
 * Form response API — responses CRUD, document lifecycle status, audit trail,
 * response export, and the cross-template issued-documents list.
 */
import { z } from 'zod'
import { apiFetch, apiFetchBlobWithFilename, downloadBlob } from './client'
import { jsonBody } from './apiHelpers'
import {
  FormResponseSchema,
  FormResponseListSchema,
  SubmitResponseResultSchema,
  type FormResponse,
  type FormResponseList,
  type ReportStatus,
} from '@/lib/schemas/formResponse'
import type { SummaryItem } from '@/lib/summaryFormat'

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

/** Update the document lifecycle status of an issued report (#163). */
export async function updateResponseStatus(
  templateId: string,
  responseId: string,
  status: ReportStatus,
): Promise<{ id: string; status: ReportStatus }> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}/status`,
    z.object({ id: z.string(), status: z.enum(['draft', 'issued', 'sent', 'void']) }),
    jsonBody({ status }, 'PATCH'),
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
// Issued documents — cross-template view (issue #190)
// ---------------------------------------------------------------------------

export interface IssuedDocument {
  id: string
  templateId: string
  templateName: string
  status: ReportStatus
  documentNumber: string
  submittedAt: number
  submittedBy: string
  summary: string[]
  /** Structured summary (#412): `{key, text}` for scalar leaves, `{key, count}` for arrays. */
  summaryItems?: SummaryItem[]
}

export interface IssuedDocumentList {
  items: IssuedDocument[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

/** Cross-template list of issued documents (form responses), optionally filtered. */
export async function listDocuments(
  opts: { status?: ReportStatus; templateId?: string; offset?: number; limit?: number } = {},
): Promise<IssuedDocumentList> {
  const params = new URLSearchParams({
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 100),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.templateId ? { templateId: opts.templateId } : {}),
  })
  const res = await fetch(`/api/v2/documents?${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list documents: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Status-transition audit trail (issue #188)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string
  from: string | null
  to: string
  by: string
  at: number
}

/** Fetch the status-transition history of a response, newest first. */
export async function getResponseAudit(
  templateId: string,
  responseId: string,
): Promise<AuditEntry[]> {
  const res = await fetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}/audit`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Failed to fetch audit: ${res.status}`)
  const body = (await res.json()) as { entries?: AuditEntry[] }
  return body.entries ?? []
}
