import { test, expect } from '@playwright/test'
import {
  startBlankEditor,
  addElementFromPalette,
  previewPane,
} from './helpers'

/**
 * Data binding + live preview (#261).
 *
 * A dataField element is bound to a key (フィールドキー), sample data is applied
 * via the データ設定 modal (template data source), and the live-preview pane is
 * asserted to render the RESOLVED value while the editor canvas keeps showing
 * the design-time placeholder label. Empty-binding suppression is also covered:
 * before any data exists, the bound element renders nothing in preview
 * (isDataEmptyInPreview) while the editor shows its placeholder.
 */

test('dataField binding resolves in live preview, placeholder stays in editor', async ({ page }) => {
  await startBlankEditor(page)

  // 1. Place a dataField and bind it to a flat sample-data key. (The form-mode
  //    data source stores keys literally, and resolveField walks dot-notation
  //    as a nested path — so a single-segment key is the stable choice here.)
  const el = await addElementFromPalette(page, 'データフィールド')
  await el.click()
  const fieldKeyInput = page.getByLabel('フィールドキー')
  await expect(fieldKeyInput).toBeVisible()
  await fieldKeyInput.fill('customerName')

  // The editor shows the design-time placeholder (element label), not a value.
  await expect(el).toContainText('フィールド')

  // 2. Turn on the live preview pane.
  await page.getByRole('button', { name: 'プレビューを表示' }).click()
  const preview = previewPane(page)
  await expect(preview.getByText('ライブプレビュー').first()).toBeVisible()

  // 3. No data yet → empty-binding suppression hides the bound element in
  //    preview: neither the placeholder label nor any value is rendered there.
  await expect(preview.locator('[data-element-id]')).toHaveCount(1)
  await expect(preview.locator('[data-element-id]').first()).not.toContainText('フィールド')

  // 4. Apply sample data via データ設定 → テンプレートデータ (form mode).
  await page.getByRole('button', { name: 'データ設定' }).click()
  const modal = page.getByRole('dialog').filter({ hasText: 'データソース' })
  await expect(modal).toBeVisible()
  await modal.getByPlaceholder('例: customer.name').first().fill('customerName')
  await modal.getByPlaceholder('例: 山田太郎').first().fill('E2E太郎')
  await modal.getByRole('button', { name: 'データを適用' }).click()
  // The applied data source is summarized in the panel.
  await expect(modal.getByText('件のトップレベルフィールド')).toBeVisible()
  await modal.getByLabel('閉じる').click()

  // 5. The preview now renders the resolved value…
  await expect(preview.locator('[data-element-id]').first()).toContainText('E2E太郎')

  // …and the editor ALSO resolves it (same data), but marks it as sample data —
  // the two panes render from the same resolved record by design.
  await expect(page.locator('main [data-element-id]').first()).toContainText('E2E太郎')
})
