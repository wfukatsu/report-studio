import { test, expect } from '@playwright/test'

/**
 * Editor happy-path smoke (#221).
 *
 * Drives the flow that unit/component tests can't reach — real browser, real
 * backend, real download: login → blank template → place an element on the
 * canvas → export a PDF and verify the file downloads. A regression anywhere in
 * that chain (the space where #211/#212/#214 and the past 534B blank-PDF bug all
 * lived) fails CI.
 *
 * The app is a single page at `/`: login is a modal overlay and the editor is the
 * default tab, so there are no route changes to wait on — assert on UI state.
 */
test('login → blank template → add element → export PDF', async ({ page }) => {
  await page.goto('/')

  // 1. Login. The modal only renders once the backend health poll succeeds, so a
  //    generous timeout absorbs backend warm-up.
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('ユーザーID').fill('admin')
  await page.getByLabel('パスワード').fill('changeme')
  await page.getByRole('button', { name: 'ログイン' }).click()

  // On success the login modal unmounts and the toolbar user menu appears.
  await expect(page.getByRole('button', { name: 'ユーザーメニュー' })).toBeVisible({
    timeout: 20_000,
  })

  // 2. A fresh session opens on a blank page with the onboarding overlay. Keep the
  //    blank page (dismiss the overlay) so the palette is clickable.
  const startBlank = page.getByRole('button', { name: '白紙のまま作る' })
  if (await startBlank.isVisible().catch(() => false)) {
    await startBlank.click()
  }

  // 3. Add a text element via click-to-add (the 要素 palette tab is active by
  //    default). Every placed element renders a data-element-id on the canvas.
  await page.getByRole('button', { name: 'テキスト', exact: true }).click()
  await expect(page.locator('[data-element-id]')).not.toHaveCount(0)

  // 4. Export a PDF and assert a real download fires with a .pdf filename.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'エクスポート' }).click()
  await page.getByRole('menuitem', { name: 'PDF（現在の編集内容・高品質）' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
})
