import { test, expect } from '@playwright/test'
import { startBlankEditor, editorElements } from './helpers'

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
 * Shared login/onboarding steps live in helpers.ts (#261).
 */
test('login → blank template → add element → export PDF', async ({ page }) => {
  // 1.–2. Login and land on an interactable blank canvas (onboarding dismissed).
  await startBlankEditor(page)

  // 3. Add a text element via click-to-add (the 要素 palette tab is active by
  //    default). Every placed element renders a data-element-id on the canvas.
  await page.getByRole('button', { name: 'テキスト', exact: true }).click()
  await expect(editorElements(page)).not.toHaveCount(0)

  // 4. Export a PDF and assert a real download fires with a .pdf filename.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'エクスポート' }).click()
  await page.getByRole('menuitem', { name: 'PDF（現在の編集内容・高品質）' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
})
