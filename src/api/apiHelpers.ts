/**
 * Shared helpers for the domain API modules (templateApi, responseApi, ...).
 */

// ---------------------------------------------------------------------------
// Helper: JSON body init
// ---------------------------------------------------------------------------

export function jsonBody(body: unknown, method: string = 'POST'): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
