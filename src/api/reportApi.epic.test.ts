import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listJobs, cancelJob, listDocuments, getResponseAudit,
  submitBatchPdfJob, submitBatchPdfJobFromRows,
  createApiToken, listApiTokens, revokeApiToken,
} from './reportApi'

/**
 * Tests for the Epic follow-up API wrappers (#188/#190/#191/#193/#194/#195).
 * Each asserts the request URL/method/body and the parsed shape of the response.
 */

function mockFetch(response: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: () => Promise.resolve(response),
    blob: () => Promise.resolve(new Blob(['x'])),
    headers: new Headers({ 'Content-Disposition': 'attachment; filename="f.zip"' }),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => { vi.unstubAllGlobals() })

describe('unified jobs (#191)', () => {
  it('listJobs GETs /api/v2/pdf-jobs and returns the array', async () => {
    const jobs = [{ jobId: 'j1', jobType: 'V2_BATCH', status: 'completed', templateId: 't', total: 3, completed: 3, failed: 0, createdAt: 1, updatedAt: 2, completedAt: 2 }]
    const fn = mockFetch(jobs)
    const result = await listJobs()
    expect(fn).toHaveBeenCalledWith('/api/v2/pdf-jobs', expect.objectContaining({ credentials: 'include' }))
    expect(result).toEqual(jobs)
  })

  it('cancelJob DELETEs the job path', async () => {
    const fn = mockFetch({ cancelled: true })
    await cancelJob('batch-9')
    expect(fn).toHaveBeenCalledWith('/api/v2/pdf-jobs/batch-9', expect.objectContaining({ method: 'DELETE' }))
  })

  it('cancelJob throws on non-ok', async () => {
    mockFetch({}, { ok: false, status: 404 })
    await expect(cancelJob('nope')).rejects.toThrow()
  })
})

describe('issued documents (#190)', () => {
  it('listDocuments passes status filter and returns items', async () => {
    const body = { items: [{ id: 'd1', templateId: 't', templateName: 'Inv', status: 'issued', documentNumber: 'INV-1', submittedAt: 1, submittedBy: 'admin', summary: [] }], total: 1, offset: 0, limit: 100, hasMore: false }
    const fn = mockFetch(body)
    const result = await listDocuments({ status: 'issued' })
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('/api/v2/documents?')
    expect(url).toContain('status=issued')
    expect(result.items).toHaveLength(1)
  })
})

describe('status audit (#188)', () => {
  it('getResponseAudit unwraps the entries array', async () => {
    const entries = [{ id: 'a1', from: 'draft', to: 'issued', by: 'admin', at: 5 }]
    const fn = mockFetch({ responseId: 'r1', entries })
    const result = await getResponseAudit('t1', 'r1')
    expect(fn.mock.calls[0][0]).toBe('/api/v2/templates/t1/responses/r1/audit')
    expect(result).toEqual(entries)
  })

  it('getResponseAudit tolerates a missing entries field', async () => {
    mockFetch({ responseId: 'r1' })
    expect(await getResponseAudit('t1', 'r1')).toEqual([])
  })
})

describe('batch export (#193/#194)', () => {
  it('submitBatchPdfJob includes filenameTemplate when provided', async () => {
    const fn = mockFetch({ batchJobId: 'b1', totalCount: 2, status: 'pending', statusUrl: '/x' })
    await submitBatchPdfJob('t1', ['r1', 'r2'], { filenameTemplate: '{documentNo}.pdf' })
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ templateId: 't1', responseIds: ['r1', 'r2'], filenameTemplate: '{documentNo}.pdf' })
  })

  it('submitBatchPdfJob omits filenameTemplate when absent', async () => {
    const fn = mockFetch({ batchJobId: 'b1', totalCount: 1, status: 'pending', statusUrl: '/x' })
    await submitBatchPdfJob('t1', ['r1'])
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('filenameTemplate')
  })

  it('submitBatchPdfJobFromRows posts rows', async () => {
    const fn = mockFetch({ batchJobId: 'b2', totalCount: 1, status: 'pending', statusUrl: '/x' })
    await submitBatchPdfJobFromRows('t1', [{ name: 'A' }])
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ templateId: 't1', rows: [{ name: 'A' }] })
  })
})

describe('API tokens (#195)', () => {
  it('createApiToken posts the label and returns the plaintext', async () => {
    const fn = mockFetch({ id: 'h', token: 'rpat_secret', label: 'ci', preview: 'rpat_secret…', createdAt: 1 }, { status: 201 })
    const result = await createApiToken('ci')
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ label: 'ci' })
    expect(result.token).toBe('rpat_secret')
  })

  it('listApiTokens unwraps the tokens array', async () => {
    mockFetch({ tokens: [{ id: 'h', label: 'ci', preview: 'rpat_…', createdAt: 1, lastUsedAt: 0 }] })
    const result = await listApiTokens()
    expect(result).toHaveLength(1)
  })

  it('revokeApiToken DELETEs the token path', async () => {
    const fn = mockFetch({ revoked: true })
    await revokeApiToken('hash123')
    expect(fn).toHaveBeenCalledWith('/api/v1/auth/tokens/hash123', expect.objectContaining({ method: 'DELETE' }))
  })
})
