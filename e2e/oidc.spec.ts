import { test, expect } from '@playwright/test'

/**
 * Keycloak (OIDC) login flows (#499) against a real identity provider.
 *
 * Runs only when the backend was started with OIDC configured
 * (OIDC_ISSUER set in the environment — see the `e2e-oidc` CI job, which
 * boots quay.io/keycloak/keycloak with docker/keycloak/report-studio-realm.json
 * imported: users kc-admin / kc-user, password "changeme"). Locally:
 *
 *   docker compose --profile keycloak up keycloak
 *   OIDC_ISSUER=http://localhost:8180/realms/report-studio OIDC_CLIENT_ID=report-studio \
 *   OIDC_REDIRECT_URI=http://localhost:5173/api/v1/auth/oidc/callback npx playwright test e2e/oidc.spec.ts
 */
const ISSUER = process.env.OIDC_ISSUER
test.skip(!ISSUER, 'OIDC_ISSUER not set — Keycloak E2E is opt-in')

const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`

async function keycloakSignIn(page: import('@playwright/test').Page, user: string) {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Keycloak でログイン' }).click()
  await page.locator('#username').fill(user)
  await page.locator('#password').fill('changeme')
  await page.locator('#kc-login').click()
  await expect(page.getByRole('button', { name: 'ユーザーメニュー' })).toBeVisible({ timeout: 20_000 })
}

async function accessToken(request: import('@playwright/test').APIRequestContext, user: string) {
  const res = await request.post(TOKEN_ENDPOINT, {
    form: { grant_type: 'password', client_id: 'report-studio', username: user, password: 'changeme', scope: 'openid' },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { access_token: string; id_token: string }
}

test('Keycloak login provisions an admin session and logs out through the provider', async ({ page }) => {
  await keycloakSignIn(page, 'kc-admin')

  const me = await (await page.request.get('/api/v1/auth/me')).json()
  expect(me.userId).toBe('kc-admin')
  expect(me.provider).toBe('oidc')
  expect(me.roles).toContain('admin')
  expect(me.hasPassword).toBe(false)

  // admin role mapped from realm_access → admin API allowed
  expect((await page.request.get('/api/v1/admin/users')).status()).toBe(200)

  // RP-initiated logout: the SSO session ends, so the next login shows the Keycloak form again
  await page.getByRole('button', { name: 'ユーザーメニュー' }).click()
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 })
  expect((await page.request.get('/api/v2/templates')).status()).toBe(401)
  await page.getByRole('button', { name: 'Keycloak でログイン' }).click()
  await expect(page.locator('#kc-login')).toBeVisible({ timeout: 20_000 })
})

test('local password login keeps working next to Keycloak', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('ユーザーID').fill('admin')
  await page.getByLabel('パスワード').fill('changeme')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByRole('button', { name: 'ユーザーメニュー' })).toBeVisible({ timeout: 20_000 })
  const me = await (await page.request.get('/api/v1/auth/me')).json()
  expect(me.provider).toBe('local')
})

test('Bearer access tokens authenticate API calls for provisioned accounts only', async ({ page, request }) => {
  // kc-user has never signed in through the browser → no account → 401 (never auto-provisioned)
  const fresh = await accessToken(request, 'kc-user')
  expect((await request.get('/api/v2/templates', { headers: { Authorization: `Bearer ${fresh.access_token}` } })).status()).toBe(401)

  await keycloakSignIn(page, 'kc-user')
  const { access_token, id_token } = await accessToken(request, 'kc-user')
  expect((await request.get('/api/v2/templates', { headers: { Authorization: `Bearer ${access_token}` } })).status()).toBe(200)
  // plain user → admin API forbidden
  expect((await request.get('/api/v1/admin/users', { headers: { Authorization: `Bearer ${access_token}` } })).status()).toBe(403)
  // an ID token is not an API credential
  expect((await request.get('/api/v2/templates', { headers: { Authorization: `Bearer ${id_token}` } })).status()).toBe(401)
  // tampered
  expect((await request.get('/api/v2/templates', { headers: { Authorization: `Bearer ${access_token}x` } })).status()).toBe(401)
})
