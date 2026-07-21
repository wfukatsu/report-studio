import { test, expect } from '@playwright/test'
import {
  startBlankEditor,
  dismissOverlays,
  addElementFromPalette,
  editorElements,
  saveAsNewTemplate,
  uniqueName,
} from './helpers'

/**
 * Template lifecycle (#261): save as a new personal template, reload the app
 * (session survives), reopen the template from the server list, verify the
 * content round-tripped, then add a second page and navigate between pages.
 *
 * The backend template store persists across local runs, so every artifact
 * uses a unique name and the test cleans up after itself via the API.
 */

test('save → reload → reopen from server → page navigation', async ({ page }) => {
  await startBlankEditor(page)

  // 1. Author minimal content and save it as a new personal template.
  const name = uniqueName('E2E-lifecycle')
  await addElementFromPalette(page, 'テキスト')
  await saveAsNewTemplate(page, name)

  // 2. Reload — the cookie session survives, no login modal. The autosave
  //    restore banner / onboarding overlay may appear on the pristine editor.
  await page.reload()
  await expect(page.getByRole('button', { name: 'ユーザーメニュー' })).toBeVisible({
    timeout: 20_000,
  })
  await dismissOverlays(page)

  // 3. Open the saved template from the server list (開く → template picker).
  await page.getByRole('button', { name: 'サーバーのテンプレートを開く' }).click()
  await page.getByRole('button', { name: `テンプレート ${name} を開く` }).click()

  // The definition round-trips: report name + the placed text element.
  await expect(page.getByLabel('レポート名')).toHaveValue(name, { timeout: 15_000 })
  await expect(editorElements(page)).toHaveCount(1)
  await expect(editorElements(page).first()).toContainText('テキスト')

  // 4. Add a second page from the ページ sidebar tab and navigate.
  await page.getByRole('tab', { name: 'ページ', exact: true }).click()
  const pagePanel = page.locator('#tabpanel-pages')
  await expect(pagePanel.getByText('ページ一覧')).toBeVisible()
  await pagePanel.getByTitle('ページを追加').click()

  const pageRows = pagePanel.locator('.space-y-1 > div')
  await expect(pageRows).toHaveCount(2)

  // The new page becomes active — its canvas is empty.
  await expect(editorElements(page)).toHaveCount(0)

  // Navigate back to page 1 (click the row edge, not the rename input).
  await pageRows.first().click({ position: { x: 6, y: 10 } })
  await expect(editorElements(page)).toHaveCount(1)
  await expect(editorElements(page).first()).toContainText('テキスト')

  // Cleanup: delete the template via the API (cookie-authenticated).
  const list = await page.request.get('/api/v2/templates')
  expect(list.status()).toBe(200)
  const { items } = (await list.json()) as { items: Array<{ id: string; name: string }> }
  const mine = items.find((t) => t.name === name)
  expect(mine).toBeTruthy()
  const del = await page.request.delete(`/api/v2/templates/${mine!.id}`, {
    headers: { Origin: 'http://localhost:5173' },
  })
  expect(del.ok()).toBe(true)
})
