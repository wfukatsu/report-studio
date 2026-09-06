/**
 * Query parameters the server's OIDC callback redirects back with (#499).
 * Shared by LoginModal (anonymous) and useOidcRedirectResult (signed in).
 */
export const OIDC_ERROR_CODES = [
  'provider_error', 'invalid_state', 'invalid_token', 'user_conflict', 'no_role',
  'provider_unavailable', 'link_unauthorized', 'link_disabled', 'rate_limited',
] as const
export type OidcErrorCode = (typeof OIDC_ERROR_CODES)[number]

export interface OidcRedirectResult {
  error: OidcErrorCode | null
  linked: boolean
}

const NONE: OidcRedirectResult = { error: null, linked: false }

/**
 * Pure read of `oidc_error` / `oidc_linked` from the current URL (safe in a
 * render-phase initializer). Unknown error codes map to the generic provider
 * error. Never throws (jsdom / previews may lack `location`).
 */
export function readOidcRedirectParams(): OidcRedirectResult {
  try {
    const params = new URL(window.location.href).searchParams
    const rawError = params.get('oidc_error')
    const linked = params.get('oidc_linked') === '1'
    const error = rawError === null
      ? null
      : (OIDC_ERROR_CODES as readonly string[]).includes(rawError) ? (rawError as OidcErrorCode) : 'provider_error'
    return { error, linked }
  } catch {
    return NONE
  }
}

/**
 * Removes the OIDC parameters from the URL so a reload does not re-show a stale
 * message. A side effect — call it from an effect, not during render.
 */
export function stripOidcRedirectParams(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('oidc_error') && !url.searchParams.has('oidc_linked')) return
    url.searchParams.delete('oidc_error')
    url.searchParams.delete('oidc_linked')
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    /* ignore */
  }
}

/** Read then strip — for effects that handle the result in one go. */
export function consumeOidcRedirectParams(): OidcRedirectResult {
  const result = readOidcRedirectParams()
  stripOidcRedirectParams()
  return result
}
