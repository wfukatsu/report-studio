import { test, expect } from '@playwright/test'
import {
  startBlankEditor,
  addElementFromPalette,
  editorElements,
  canvasPaper,
} from './helpers'

/**
 * Canvas drag-and-drop editing (#261) — the flagship editor interaction that
 * unit tests can't reach.
 *
 * Three distinct input pipelines are covered:
 *   1. Palette → canvas: HTML5 drag & drop (dataTransfer MIME
 *      `application/rds-palette`, handled by ReportCanvas.handlePaletteDrop).
 *   2. Element move: @dnd-kit PointerSensor (activation distance 4px) — driven
 *      with page.mouse using realistic small-then-large movement steps.
 *   3. Element resize: custom pointer-event handles (data-resize-handle).
 *
 * Editor zoom defaults to 1.0 and 1mm ≈ 3.78px (96dpi), so pixel deltas map
 * 1:1 to what the store persists. Assertions use tolerances that absorb
 * grid/margin snapping (gridSize 5mm ≈ 19px) without masking a broken drag.
 */

test.beforeEach(async ({ page }) => {
  await startBlankEditor(page)
})

test('palette item drags onto the canvas and creates an element (HTML5 DnD)', async ({ page }) => {
  const paletteItem = page.getByRole('button', { name: 'テキスト', exact: true })
  const paper = canvasPaper(page)

  await expect(editorElements(page)).toHaveCount(0)

  // Drop near the upper-left of the paper (well inside the page margins).
  await paletteItem.dragTo(paper, { targetPosition: { x: 150, y: 150 } })

  await expect(editorElements(page)).toHaveCount(1)
  await expect(page.locator('main [data-element-type="text"]')).toHaveCount(1)
  // The dropped element renders its default content.
  await expect(editorElements(page).first()).toContainText('テキスト')
})

test('an element can be drag-moved on the canvas (@dnd-kit pointer drag)', async ({ page }) => {
  const el = await addElementFromPalette(page, 'テキスト')
  const before = await el.boundingBox()
  if (!before) throw new Error('element has no bounding box')

  const startX = before.x + before.width / 2
  const startY = before.y + before.height / 2

  // PointerSensor activation constraint is distance: 4 — move a few px first to
  // trigger sensor activation, then travel in steps like a real pointer.
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 6, startY + 6, { steps: 3 })
  await page.mouse.move(startX + 80, startY + 80, { steps: 12 })
  await page.mouse.up()

  // The store write happens on drag end — poll the box until it settles.
  await expect(async () => {
    const after = await el.boundingBox()
    if (!after) throw new Error('element disappeared after drag')
    const dx = after.x - before.x
    const dy = after.y - before.y
    // ~80px expected; snapping (5mm grid ≈ 19px) may quantize the landing spot.
    expect(dx).toBeGreaterThan(40)
    expect(dy).toBeGreaterThan(40)
    expect(Math.abs(dx - 80)).toBeLessThanOrEqual(25)
    expect(Math.abs(dy - 80)).toBeLessThanOrEqual(25)
  }).toPass()
})

test('an element can be resized via the SE handle', async ({ page }) => {
  const el = await addElementFromPalette(page, 'テキスト')
  // Select the element so the resize handles render.
  await el.click()
  const handle = el.locator('[data-resize-handle="se"]')
  await expect(handle).toBeVisible()

  const before = await el.boundingBox()
  const handleBox = await handle.boundingBox()
  if (!before || !handleBox) throw new Error('missing bounding boxes')

  const hx = handleBox.x + handleBox.width / 2
  const hy = handleBox.y + handleBox.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx + 10, hy + 10, { steps: 3 })
  await page.mouse.move(hx + 60, hy + 40, { steps: 10 })
  await page.mouse.up()

  await expect(async () => {
    const after = await el.boundingBox()
    if (!after) throw new Error('element disappeared after resize')
    const dw = after.width - before.width
    const dh = after.height - before.height
    // Resize has no grid snapping — expect close tracking of the pointer.
    expect(Math.abs(dw - 60)).toBeLessThanOrEqual(12)
    expect(Math.abs(dh - 40)).toBeLessThanOrEqual(12)
    // Position (top-left anchor) must not move for a SE resize.
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2)
  }).toPass()
})
