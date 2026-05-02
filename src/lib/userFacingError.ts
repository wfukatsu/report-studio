/**
 * userFacingError — generalized API error classifier for end-user display.
 *
 * Maps an unknown caught value (typically `ApiError` or `NetworkError` from
 * `@/api/client`) into a structured `UserFacingError` discriminant. Contains
 * NO locale strings — the call site looks up `code → { title, hint }` via
 * `userFacingErrorMessages.ts` so the helper stays i18n-ready and pure.
 *
 * Modeled after `src/components/modals/dbConnection/classifyCreateTableError.ts`.
 * That helper is tightly coupled to the create-table flow (e.g., `showRecovery`
 * for 409); this one is general-purpose and used by panels showing connection
 * errors (DB binding, data browser, response list).
 */
import { ApiError, NetworkError } from '@/api/client'

export type UserFacingErrorCode =
  | 'unauthorized'    // 401
  | 'forbidden'       // 403
  | 'not_found'       // 404
  | 'conflict'        // 409
  | 'invalid_request' // 400
  | 'rate_limited'    // 429
  | 'unreachable'     // 503 (server up but dependency down)
  | 'server_error'    // 500 and other 5xx
  | 'network'         // fetch threw — offline, DNS, CORS
  | 'unknown'         // non-Error value or shape we don't recognize

export interface UserFacingError {
  code: UserFacingErrorCode
  /** Whether the operation is worth retrying without changing input. */
  retryable: boolean
  /** Optional server correlation id pulled from the response body. Dev-only display. */
  correlationId?: string
}

export function classifyError(err: unknown): UserFacingError {
  if (err instanceof NetworkError) {
    return { code: 'network', retryable: true }
  }
  if (err instanceof ApiError) {
    const correlationId = extractCorrelationId(err.body)
    switch (err.status) {
      case 400: return { code: 'invalid_request', retryable: false, correlationId }
      case 401: return { code: 'unauthorized',    retryable: false, correlationId }
      case 403: return { code: 'forbidden',       retryable: false, correlationId }
      case 404: return { code: 'not_found',       retryable: false, correlationId }
      case 409: return { code: 'conflict',        retryable: false, correlationId }
      case 429: return { code: 'rate_limited',    retryable: true,  correlationId }
      case 503: return { code: 'unreachable',     retryable: true,  correlationId }
      default:
        // 500 and any other status → server_error
        return { code: 'server_error', retryable: false, correlationId }
    }
  }
  return { code: 'unknown', retryable: false }
}

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
