/**
 * classifyCreateTableError — pure error classification for the
 * POST /api/v2/scalardb/tables endpoint.
 *
 * Maps an `ApiError` / `NetworkError` / unknown error to a structured
 * `CreateTableErrorInfo` discriminant. Contains NO locale strings —
 * the form component maps `code → Japanese message` at render time.
 * This keeps the helper i18n-ready and independently testable.
 */
import { ApiError, NetworkError } from '@/api/client'

export type CreateTableErrorCode =
  | 'invalid_request'  // 400
  | 'conflict'         // 409 — table already exists
  | 'unauth'           // 401
  | 'forbidden'        // 403
  | 'unreachable'      // 503
  | 'server_error'     // 500 or unknown
  | 'network'          // fetch failed entirely

export interface CreateTableErrorInfo {
  code: CreateTableErrorCode
  /** Whether to offer a Retry button to the user. */
  showRetry: boolean
  /** Whether to offer the "bind to existing table" recovery action. */
  showRecovery: boolean
  /**
   * Correlation ID from the server response body, if present.
   * Allows a developer to cross-reference server logs.
   */
  correlationId?: string
}

/**
 * Classify an error thrown by `createScalarDbTable()`.
 *
 * @param err - any value caught from a `createScalarDbTable()` call
 */
export function classifyCreateTableError(err: unknown): CreateTableErrorInfo {
  if (err instanceof NetworkError) {
    return { code: 'network', showRetry: true, showRecovery: false }
  }

  if (err instanceof ApiError) {
    const correlationId = extractCorrelationId(err.body)

    switch (err.status) {
      case 400:
        return { code: 'invalid_request', showRetry: false, showRecovery: false }
      case 401:
        return { code: 'unauth', showRetry: false, showRecovery: false }
      case 403:
        return { code: 'forbidden', showRetry: false, showRecovery: false }
      case 409:
        return { code: 'conflict', showRetry: false, showRecovery: true }
      case 503:
        return { code: 'unreachable', showRetry: true, showRecovery: false, correlationId }
      default:
        // 500 and any other status → treat as server_error
        return { code: 'server_error', showRetry: false, showRecovery: false, correlationId }
    }
  }

  // Unknown error type
  return { code: 'server_error', showRetry: false, showRecovery: false }
}

/**
 * Safely extract the `correlationId` field from an API response body.
 * Uses an explicit type guard rather than `as any` to prevent type-unsafety.
 */
function extractCorrelationId(body: unknown): string | undefined {
  if (
    body !== null &&
    typeof body === 'object' &&
    'correlationId' in body &&
    typeof (body as { correlationId: unknown }).correlationId === 'string'
  ) {
    return (body as { correlationId: string }).correlationId
  }
  return undefined
}
