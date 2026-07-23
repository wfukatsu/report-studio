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

/**
 * Thrown when a 2xx response body does not match its Zod schema. Wraps the raw
 * `ZodError` as `cause` (logged, never surfaced) so the UI can show a friendly
 * message instead of dumping the raw issue array to the user (#388).
 */
export class ResponseValidationError extends Error {
  cause?: unknown
  constructor(
    public readonly path: string,
    options?: { cause?: unknown },
  ) {
    super(`Response validation failed for ${path}`)
    if (options?.cause !== undefined) this.cause = options.cause
    this.name = 'ResponseValidationError'
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError
}

export function isResponseValidationError(e: unknown): e is ResponseValidationError {
  return e instanceof ResponseValidationError
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
    return parseOrThrow(schema, undefined, path)
  }

  return parseOrThrow(schema, await res.json(), path)
}

/**
 * Validate `data` against `schema`, converting a `ZodError` into a
 * `ResponseValidationError`. The raw issues are logged for debugging but never
 * become the thrown error's message, so callers that surface `error.message`
 * can't leak the raw Zod issue array into the UI (#388).
 */
function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown, path: string): T {
  try {
    return schema.parse(data)
  } catch (cause) {
    if (cause instanceof z.ZodError) {
      console.error(`Response validation failed for ${path}`, cause.issues)
      throw new ResponseValidationError(path, { cause })
    }
    throw cause
  }
}

// ---------------------------------------------------------------------------
// Blob download helpers (CSV, Excel, PDF — cannot use Zod)
// ---------------------------------------------------------------------------

/**
 * Fetch a binary response (blob) with error handling.
 * Returns the blob and the filename from the Content-Disposition header.
 */
export async function apiFetchBlobWithFilename(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string }> {
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
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const match = cd.match(/filename="?([^";\r\n]+)"?/)
  const filename = match ? match[1] : 'download'
  return { blob, filename }
}

/** Trigger a browser file download from a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
