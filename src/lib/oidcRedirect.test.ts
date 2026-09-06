import { describe, it, expect, beforeEach } from 'vitest'
import { consumeOidcRedirectParams } from './oidcRedirect'

beforeEach(() => { window.history.replaceState(null, '', '/') })

describe('consumeOidcRedirectParams', () => {
  it('returns nothing and leaves the URL alone when no OIDC params are present', () => {
    window.history.replaceState(null, '', '/?keep=1')
    expect(consumeOidcRedirectParams()).toEqual({ error: null, linked: false })
    expect(window.location.search).toBe('?keep=1')
  })

  it('consumes known error codes and strips only the OIDC params', () => {
    window.history.replaceState(null, '', '/?oidc_error=link_disabled&keep=1')
    expect(consumeOidcRedirectParams()).toEqual({ error: 'link_disabled', linked: false })
    expect(window.location.search).toBe('?keep=1')
  })

  it('maps unknown codes to provider_error and reports the linked flag', () => {
    window.history.replaceState(null, '', '/?oidc_error=weird&oidc_linked=1')
    expect(consumeOidcRedirectParams()).toEqual({ error: 'provider_error', linked: true })
    expect(window.location.search).toBe('')
  })
})
