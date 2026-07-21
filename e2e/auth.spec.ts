import { test, expect } from '@playwright/test'
import { login, uniqueName } from './helpers'

/**
 * Session auth + PAT (Personal Access Token) flows (#261).
 *
 * Logout must actually invalidate the server-side session (not just clear UI
 * state): after logout the protected template-list API returns 401 for the old
 * cookie and the SPA drops back to the login modal. PATs (#195) are issued in
 * 管理 → APIトークン and authenticate raw API calls via
 * `Authorization: Bearer <token>` — verified with a cookie-less request context.
 */

test('logout invalidates the session server-side, re-login works', async ({ page }) => {
  await login(page)

  // Sanity: the session cookie authenticates API calls (page.request shares
  // the browser context's cookies).
  const authed = await page.request.get('/api/v2/templates')
  expect(authed.status()).toBe(200)

  // Logout via the user menu.
  await page.getByRole('button', { name: 'ユーザーメニュー' }).click()
  await page.getByRole('button', { name: 'ログアウト' }).click()

  // The protected app drops back to the login modal…
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('ユーザーID')).toBeVisible()

  // …and the old session cookie no longer authenticates API calls.
  const afterLogout = await page.request.get('/api/v2/templates')
  expect(afterLogout.status()).toBe(401)

  // Re-login from the same modal.
  await page.getByLabel('ユーザーID').fill('admin')
  await page.getByLabel('パスワード').fill('changeme')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('button', { name: 'ユーザーメニュー' })).toBeVisible({
    timeout: 20_000,
  })
  const reAuthed = await page.request.get('/api/v2/templates')
  expect(reAuthed.status()).toBe(200)
})

test('PAT issued via the UI authenticates a raw Bearer API request', async ({ page, request }) => {
  await login(page)

  // 管理 tab → APIトークン section (the section nav uses plain buttons).
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await page.getByRole('button', { name: 'APIトークン', exact: true }).click()
  await expect(page.getByText('APIトークン (PAT)')).toBeVisible()

  // Issue a token with a recognizable label.
  const label = uniqueName('e2e-pat')
  await page.getByPlaceholder('用途ラベル（例: CI, ローカルCLI）').fill(label)
  await page.getByRole('button', { name: '発行' }).click()

  // The plaintext token is revealed exactly once in a copyable box.
  const reveal = page.getByText('トークンを発行しました。この値は再表示されません。', { exact: false })
  await expect(reveal).toBeVisible({ timeout: 15_000 })
  const token = (await page.locator('code.break-all').innerText()).trim()
  expect(token.length).toBeGreaterThan(20)

  // The issued token appears in the list with its label.
  await expect(page.getByRole('cell', { name: label })).toBeVisible()

  // The `request` fixture has NO cookies — only the Bearer header authenticates.
  const noAuth = await request.get('/api/v2/templates')
  expect(noAuth.status()).toBe(401)

  const bearer = await request.get('/api/v2/templates', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(bearer.status()).toBe(200)
  const body = (await bearer.json()) as { items: unknown[] }
  expect(Array.isArray(body.items)).toBe(true)

  // Cleanup: revoke the token so reruns don't accumulate rows, and verify the
  // revoked token is rejected.
  const row = page.getByRole('row', { name: new RegExp(label) })
  await row.getByRole('button', { name: '失効' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '失効' }).click()
  await expect(page.getByText('トークンを失効しました')).toBeVisible()
  const revoked = await request.get('/api/v2/templates', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(revoked.status()).toBe(401)
})
