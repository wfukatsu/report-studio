import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared E2E helpers (#261).
 *
 * The app is a single page at `/`: login is a modal overlay and the editor is
 * the default tab. A fresh backend seeds the admin/changeme account (#221).
 * All helpers wait on real UI signals (dialog unmount, element appearance),
 * never on fixed sleeps.
 */

export const ADMIN_USER = 'admin'
export const ADMIN_PASSWORD = 'changeme'

/** Log in as the seeded admin user and wait for the editor toolbar to be ready. */
export async function login(page: Page): Promise<void> {
  await page.goto('/')
  // The login modal only renders once the backend health poll succeeds, so a
  // generous timeout absorbs backend warm-up.
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('ユーザーID').fill(ADMIN_USER)
  await page.getByLabel('パスワード').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  // On success the login modal unmounts and the toolbar user menu appears.
  await expect(page.getByRole('button', { name: 'ユーザーメニュー' })).toBeVisible({
    timeout: 20_000,
  })
}

/**
 * Clear leftover per-user UI state (autosave restore banner, empty-canvas
 * onboarding) so the palette and canvas are interactable. Both are optional:
 * they only appear in certain session states.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  // Autosave restore banner (appears after a reload that follows unsaved edits)
  const discard = page.getByRole('button', { name: '破棄' })
  if (await discard.isVisible().catch(() => false)) {
    await discard.click()
    await expect(discard).toBeHidden()
  }
  // Empty-canvas onboarding overlay. It can render a beat after the restore
  // banner clears, so wait briefly (bounded, returns as soon as it shows).
  const startBlank = page.getByRole('button', { name: '白紙のまま作る' })
  await startBlank.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {})
  if (await startBlank.isVisible().catch(() => false)) {
    await startBlank.click()
  }
}

/** Login + dismiss overlays: lands on an interactable blank editor canvas. */
export async function startBlankEditor(page: Page): Promise<void> {
  await login(page)
  await dismissOverlays(page)
}

/**
 * Elements placed on the EDITOR canvas (excludes the live-preview pane, which
 * renders its own copy of the page). The editor canvas lives inside <main>;
 * the preview pane is a sibling of <main>.
 */
export function editorElements(page: Page): Locator {
  return page.locator('main [data-element-id]')
}

/** The live-preview pane root (sibling of <main>, only when preview is on). */
export function previewPane(page: Page): Locator {
  return page.locator('main + div')
}

/**
 * The editor paper (drop target for palette drags). It is the only scaled,
 * shadowed sheet inside <main> — ReportCanvas renders it with inline
 * `box-shadow` + `transform: scale(...)` styles.
 */
export function canvasPaper(page: Page): Locator {
  return page.locator('main div[style*="box-shadow"]').first()
}

/**
 * Add an element by clicking its palette button (要素 tab is active by default)
 * and return a locator for the newly created element.
 */
export async function addElementFromPalette(page: Page, label: string): Promise<Locator> {
  const existing = await editorElements(page).evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-element-id')),
  )
  await page.getByRole('button', { name: label, exact: true }).click()
  await expect(editorElements(page)).toHaveCount(existing.length + 1)
  const after = await editorElements(page).evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-element-id')),
  )
  const newId = after.find((id) => !existing.includes(id))
  if (!newId) throw new Error(`palette add "${label}" did not create a new element`)
  return page.locator(`main [data-element-id="${newId}"]`)
}

/**
 * Save the current editor content as a NEW named template via the toolbar
 * (保存 → SaveTemplateDialog) and wait for the success toast.
 */
export async function saveAsNewTemplate(page: Page, name: string): Promise<void> {
  await page.getByLabel('レポート名').fill(name)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'テンプレートを保存' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('テンプレート名').fill(name)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  // New templates are private by default — the toast says so and names it (#158).
  await expect(page.getByText(`「${name}」を個人テンプレートとして保存しました`)).toBeVisible({
    timeout: 15_000,
  })
}

/** Unique-enough name for artifacts created by a test run. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}
