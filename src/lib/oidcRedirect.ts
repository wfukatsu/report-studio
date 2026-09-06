/**
 * Query parameters the server's OIDC callback redirects back with (#499).
 * Shared by LoginModal (anonymous) and useOidcRedirectResult (signed in).
 */
export const OIDC_ERROR_CODES = [
  'provider_error', 'invalid_state', 'invalid_token', 'user_conflict', 'no_role',
  'provider_unavailable', 'link_unauthorized', 'link_disabled',
] as const
export type OidcErrorCode = (typeof OIDC_ERROR_CODES)[number]

export interface OidcRedirectResult {
  error: OidcErrorCode | null
  linked: boolean
}

/**
 * Reads `oidc_error` / `oidc_linked` from the current URL and strips them so a
 * reload does not re-show a stale message. Unknown error codes map to the
 * generic provider error. Never throws (jsdom / previews may lack history).
 */
export function consumeOidcRedirectParams(): OidcRedirectResult {
  try {
    const url = new URL(window.location.href)
    const rawError = url.searchParams.get('oidc_error')
    const linked = url.searchParams.get('oidc_linked') === '1'
    if (rawError === null && !linked) return { error: null, linked: false }
    url.searchParams.delete('oidc_error')
    url.searchParams.delete('oidc_linked')
    window.history.replaceState(window.history.state, '', url.toString())
    const error = rawError === null
      ? null
      : (OIDC_ERROR_CODES as readonly string[]).includes(rawError) ? (rawError as OidcErrorCode) : 'provider_error'
    return { error, linked }
  } catch {
    return { error: null, linked: false }
  }
}
