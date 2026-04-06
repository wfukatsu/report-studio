import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { apiFetch, ApiError, NetworkError, isApiError, isNetworkError, parseApiErrorBody } from './client'

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? 'OK',
    json: response.json ?? (() => Promise.resolve({})),
    ...response,
  }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('returns parsed data on 200 with valid schema', async () => {
    const schema = z.object({ id: z.string(), name: z.string() })
    mockFetch({ json: () => Promise.resolve({ id: '1', name: 'Test' }) })

    const result = await apiFetch('/api/v2/templates/1', schema)
    expect(result.id).toBe('1')
    expect(result.name).toBe('Test')
  })

  it('throws ZodError when response does not match schema', async () => {
    const schema = z.object({ id: z.string() })
    mockFetch({ json: () => Promise.resolve({ id: 42 }) })  // id should be string

    await expect(apiFetch('/api/v2/templates/1', schema)).rejects.toThrow()
  })

  it('throws ApiError on 404 response', async () => {
    mockFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ message: 'not found', code: 'NOT_FOUND' }),
    })

    const schema = z.object({ id: z.string() })
    await expect(apiFetch('/api/v2/templates/99', schema)).rejects.toThrow(ApiError)
  })

  it('ApiError carries status and body', async () => {
    mockFetch({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: () => Promise.resolve({ code: 'VALIDATION_ERROR', message: 'bad expression' }),
    })

    const schema = z.object({ id: z.string() })
    try {
      await apiFetch('/api/v2/evaluate/calculations', schema)
    } catch (err) {
      expect(isApiError(err)).toBe(true)
      if (isApiError(err)) {
        expect(err.status).toBe(422)
        const body = parseApiErrorBody(err)
        expect(body?.code).toBe('VALIDATION_ERROR')
        expect(body?.message).toBe('bad expression')
      }
    }
  })

  it('throws NetworkError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const schema = z.object({ id: z.string() })
    await expect(apiFetch('/api/v2/templates/1', schema)).rejects.toThrow(NetworkError)
  })

  it('handles 204 No Content with z.undefined()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      json: () => Promise.reject(new Error('no body')),
    }))

    const result = await apiFetch('/api/v2/templates/1', z.undefined(), { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('passes credentials: include automatically', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: '1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/v2/templates/1', z.object({ id: z.string() }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/templates/1',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})

describe('isApiError / isNetworkError', () => {
  it('correctly identifies ApiError', () => {
    const err = new ApiError(404, null, 'not found')
    expect(isApiError(err)).toBe(true)
    expect(isNetworkError(err)).toBe(false)
  })

  it('correctly identifies NetworkError', () => {
    const err = new NetworkError('offline')
    expect(isNetworkError(err)).toBe(true)
    expect(isApiError(err)).toBe(false)
  })

  it('returns false for plain Error', () => {
    const err = new Error('generic')
    expect(isApiError(err)).toBe(false)
    expect(isNetworkError(err)).toBe(false)
  })
})

describe('parseApiErrorBody', () => {
  it('returns null when body is not an object', () => {
    const err = new ApiError(500, 'plain string', 'error')
    expect(parseApiErrorBody(err)).toBeNull()
  })

  it('returns partial body when only message present', () => {
    const err = new ApiError(400, { message: 'bad input' }, 'error')
    const body = parseApiErrorBody(err)
    expect(body?.message).toBe('bad input')
    expect(body?.code).toBeUndefined()
  })
})
