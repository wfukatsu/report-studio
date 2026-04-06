/**
 * HTTP client foundation — Zod-validated fetch wrapper.
 *
 * - Zod schema is required (not optional) so type safety is enforced at call sites
 * - ApiError carries HTTP status + raw body for callers to inspect
 * - NetworkError wraps fetch rejections (offline, DNS failure, etc.)
 * - Exports type-guards `isApiError` and `isNetworkError` for narrowing in catch blocks
 */
import { z, ZodSchema } from 'zod'

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class NetworkError extends Error {
  cause?: unknown
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    if (options?.cause !== undefined) this.cause = options.cause
    this.name = 'NetworkError'
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError
}

// ---------------------------------------------------------------------------
// Error body parsing
// ---------------------------------------------------------------------------

const ApiErrorBodySchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
})

export function parseApiErrorBody(
  err: ApiError,
): { message?: string; code?: string } | null {
  return ApiErrorBodySchema.safeParse(err.body).data ?? null
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Fetch with Zod validation. Schema is required — no implicit `any`.
 *
 * - Attaches `credentials: 'include'` for session cookie forwarding
 * - Throws `NetworkError` on fetch failure (offline, CORS, etc.)
 * - Throws `ApiError` on non-2xx responses
 * - Parses response with `schema.parse()` — throws `ZodError` on mismatch
 * - 204 No Content responses are parsed as `undefined` (use `z.undefined()`)
 */
export async function apiFetch<T>(
  path: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'include', ...init })
  } catch (cause) {
    throw new NetworkError('Network request failed', { cause })
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body, `HTTP ${res.status}: ${res.statusText}`)
  }

  if (res.status === 204) {
    return schema.parse(undefined)
  }

  return schema.parse(await res.json())
}
