/**
 * Jobs API — async PDF jobs, batch PDF jobs, and the unified job history.
 */
import { z } from 'zod'
import { apiFetch, apiFetchBlobWithFilename, downloadBlob } from './client'
import { jsonBody } from './apiHelpers'

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
  opts: { filenameTemplate?: string } = {},
): Promise<{ batchJobId: string; totalCount: number; status: string; statusUrl: string }> {
  const res = await fetch('/api/v2/pdf-jobs/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId,
      responseIds,
      ...(opts.filenameTemplate ? { filenameTemplate: opts.filenameTemplate } : {}),
    }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Batch job submit failed: ${res.status}`)
  return res.json()
}

/**
 * Batch PDF from arbitrary data rows (DB-row-driven bulk export, #193).
 * Each row is a data object rendered against the template.
 */
export async function submitBatchPdfJobFromRows(
  templateId: string,
  rows: Record<string, unknown>[],
  opts: { filenameTemplate?: string } = {},
): Promise<{ batchJobId: string; totalCount: number; status: string; statusUrl: string }> {
  const res = await fetch('/api/v2/pdf-jobs/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId,
      rows,
      ...(opts.filenameTemplate ? { filenameTemplate: opts.filenameTemplate } : {}),
    }),
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
// Unified job history (issue #191/#192)
// ---------------------------------------------------------------------------

export interface JobSummary {
  jobId: string
  jobType: string // V1_BATCH | V2_PDF | V2_BATCH
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  templateId: string
  total: number
  completed: number
  failed: number
  error?: string
  createdAt: number
  updatedAt: number
  completedAt: number
}

/** List every job (all types), newest first — the job-history browser feed. */
export async function listJobs(): Promise<JobSummary[]> {
  const res = await fetch('/api/v2/pdf-jobs', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list jobs: ${res.status}`)
  return res.json()
}

/** Cancel a running job or delete a terminal one (any job type). */
export async function cancelJob(jobId: string): Promise<void> {
  const res = await fetch(`/api/v2/pdf-jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to cancel job: ${res.status}`)
}
