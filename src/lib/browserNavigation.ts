/**
 * Full-page navigation seam (#499). OIDC login / provider logout leave the SPA
 * for the identity provider; tests mock this module instead of jsdom's
 * unimplemented `window.location.assign`.
 */
export function navigateTo(url: string): void {
  window.location.assign(url)
}
