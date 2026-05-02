import { describe, it, expect } from 'vitest'
import { ApiError, NetworkError } from '@/api/client'
import { classifyError } from './userFacingError'

describe('classifyError', () => {
  it('classifies NetworkError as network/retryable', () => {
    expect(classifyError(new NetworkError('offline'))).toEqual({
      code: 'network',
      retryable: true,
    })
  })

  it.each([
    [400, 'invalid_request', false],
    [401, 'unauthorized',    false],
    [403, 'forbidden',       false],
    [404, 'not_found',       false],
    [405, 'invalid_request', false],
    [409, 'conflict',        false],
    [410, 'invalid_request', false],
    [422, 'invalid_request', false],
    [429, 'rate_limited',    true],
    [451, 'invalid_request', false],
    [500, 'unreachable',     true],
    [502, 'unreachable',     true],
    [503, 'unreachable',     true],
    [504, 'unreachable',     true],
  ] as const)('maps HTTP %i to code=%s retryable=%s', (status, code, retryable) => {
    const result = classifyError(new ApiError(status, null, `HTTP ${status}`))
    expect(result.code).toBe(code)
    expect(result.retryable).toBe(retryable)
  })

  it('treats other unmapped 5xx (e.g. 599) as server_error', () => {
    expect(classifyError(new ApiError(599, null, 'HTTP 599')).code).toBe('server_error')
    expect(classifyError(new ApiError(599, null, 'HTTP 599')).retryable).toBe(false)
  })

  it('classifies a plain Error (not ApiError/NetworkError) as unknown', () => {
    expect(classifyError(new Error('boom'))).toEqual({ code: 'unknown', retryable: false })
    expect(classifyError(new TypeError('bad'))).toEqual({ code: 'unknown', retryable: false })
  })

  it('does not extract correlationId from a prototype-pollution body', () => {
    const polluted = JSON.parse('{"__proto__":{"correlationId":"evil"}}')
    expect(classifyError(new ApiError(500, polluted, 'HTTP 500')).correlationId).toBeUndefined()
  })

  it('extracts correlationId from ApiError body when present', () => {
    const result = classifyError(new ApiError(500, { correlationId: 'abc-123' }, 'HTTP 500'))
    expect(result.correlationId).toBe('abc-123')
  })

  it('omits correlationId when body has no string correlationId', () => {
    expect(classifyError(new ApiError(500, null, 'HTTP 500')).correlationId).toBeUndefined()
    expect(classifyError(new ApiError(500, {}, 'HTTP 500')).correlationId).toBeUndefined()
    expect(classifyError(new ApiError(500, { correlationId: 42 }, 'HTTP 500')).correlationId).toBeUndefined()
  })

  it.each([undefined, null, 'plain string', 42, { foo: 'bar' }])(
    'classifies non-Error value (%s) as unknown/non-retryable',
    (value) => {
      expect(classifyError(value)).toEqual({ code: 'unknown', retryable: false })
    },
  )
})
