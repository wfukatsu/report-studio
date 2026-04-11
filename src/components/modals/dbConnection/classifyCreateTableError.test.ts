import { describe, it, expect } from 'vitest'
import { classifyCreateTableError } from './classifyCreateTableError'
import { ApiError, NetworkError } from '@/api/client'

function apiError(status: number, body?: unknown): ApiError {
  return new ApiError(status, body, `HTTP ${status}`)
}

describe('classifyCreateTableError', () => {
  it('400 → invalid_request, no retry, no recovery', () => {
    const result = classifyCreateTableError(apiError(400, { error: 'Missing partition key' }))
    expect(result.code).toBe('invalid_request')
    expect(result.showRetry).toBe(false)
    expect(result.showRecovery).toBe(false)
    expect(result.correlationId).toBeUndefined()
  })

  it('409 → conflict, no retry, show recovery', () => {
    const result = classifyCreateTableError(apiError(409, { error: 'Table already exists: app.users' }))
    expect(result.code).toBe('conflict')
    expect(result.showRetry).toBe(false)
    expect(result.showRecovery).toBe(true)
  })

  it('401 → unauth, no retry, no recovery', () => {
    const result = classifyCreateTableError(apiError(401, { error: 'Authentication required' }))
    expect(result.code).toBe('unauth')
    expect(result.showRetry).toBe(false)
    expect(result.showRecovery).toBe(false)
  })

  it('403 → forbidden, no retry, no recovery', () => {
    const result = classifyCreateTableError(apiError(403, { error: 'Permission denied' }))
    expect(result.code).toBe('forbidden')
    expect(result.showRetry).toBe(false)
    expect(result.showRecovery).toBe(false)
  })

  it('503 → unreachable, show retry, no recovery, extracts correlationId', () => {
    const result = classifyCreateTableError(
      apiError(503, { error: 'ScalarDb unreachable', correlationId: 'abc12345' }),
    )
    expect(result.code).toBe('unreachable')
    expect(result.showRetry).toBe(true)
    expect(result.showRecovery).toBe(false)
    expect(result.correlationId).toBe('abc12345')
  })

  it('500 → server_error, no retry, no recovery, extracts correlationId', () => {
    const result = classifyCreateTableError(
      apiError(500, { error: 'ScalarDb DDL rejected', correlationId: 'deadbeef' }),
    )
    expect(result.code).toBe('server_error')
    expect(result.showRetry).toBe(false)
    expect(result.showRecovery).toBe(false)
    expect(result.correlationId).toBe('deadbeef')
  })

  it('NetworkError → network, show retry, no recovery', () => {
    const result = classifyCreateTableError(new NetworkError('Failed to fetch', { cause: new TypeError('Failed to fetch') }))
    expect(result.code).toBe('network')
    expect(result.showRetry).toBe(true)
    expect(result.showRecovery).toBe(false)
    expect(result.correlationId).toBeUndefined()
  })

  it('unknown error → server_error, no retry, no recovery', () => {
    const result = classifyCreateTableError(new Error('unknown'))
    expect(result.code).toBe('server_error')
    expect(result.showRetry).toBe(false)
  })
})
