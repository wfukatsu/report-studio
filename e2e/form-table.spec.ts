import { test, expect } from '@playwright/test'
import { startBlankEditor, addElementFromPalette, canvasPaper } from './helpers'

/**
 * FormTable interactive editing (#261).
 *
 * The 帳票テーブル element supports Excel-like in-canvas editing: double-click
 * enters table edit mode (role=grid), a cell double-click opens the CellPopover
 * for inline edits, and a cell right-click opens the row/column context menu.
 * The default table is 3 columns × 2 rows (header labels 項目 1..3 + one input
 * body row) = 6 cells.
 */

test.beforeEach(async ({ page }) => {
  await startBlankEditor(page)
})

test('double-click enters edit mode, inline cell edit persists after exit', async ({ page }) => {
  const el = await addElementFromPalette(page, '帳票テーブル')
  await expect(el.locator('[data-cell-id]')).toHaveCount(6)

  // Enter table edit mode.
  await el.dblclick()
  const grid = page.getByRole('grid', { name: 'テーブル編集' })
  await expect(grid).toBeVisible()

  // Select the first header cell, then double-click it to open the popover.
  // NOTE: data-row-idx is section-relative (header/body sections both start at
  // 0), so cells are addressed by DOM order: 3 header cells, then 3 body cells.
  const headerCell = grid.locator('[data-cell-id]').first()
  const headerCellId = await headerCell.getAttribute('data-cell-id')
  await headerCell.click()
  await headerCell.dblclick()

  // The CellPopover opens for the cell (portaled to <body> with an inline
  // z-index of 99998 — the formTable PropertiesPanel has same-placeholder
  // inputs, so scope through the portal wrapper). The default header cell is
  // a label cell — its text input is the stable handle. (fill() focuses
  // without a mousedown, which matters: the editor exits on any mousedown
  // outside its container.)
  const popover = page.locator('div[style*="99998"]')
  const labelInput = popover.getByPlaceholder('ラベルテキスト')
  await expect(labelInput).toBeVisible()
  await labelInput.fill('E2E見出し')
  await expect(page.locator(`[data-cell-id="${headerCellId}"]`)).toContainText('E2E見出し')

  // Esc closes the popover (editing → selecting).
  await page.keyboard.press('Escape')
  await expect(labelInput).toHaveCount(0)

  // Click empty paper below the table to leave edit mode (mousedown-outside
  // handler). The default table sits at the top of the page, so the lower
  // half of the sheet is guaranteed element-free.
  // (300px ≈ 79mm from the sheet top — below the 13+24mm table, still in the
  // viewport without scrolling.)
  const paper = await canvasPaper(page).boundingBox()
  if (!paper) throw new Error('canvas paper not found')
  await page.mouse.click(paper.x + paper.width * 0.5, paper.y + 300)
  await expect(page.getByRole('grid', { name: 'テーブル編集' })).toHaveCount(0)

  // The edited content persisted to the store and still renders.
  await expect(el).toContainText('E2E見出し')
})

test('context menu inserts a row below the selected cell', async ({ page }) => {
  const el = await addElementFromPalette(page, '帳票テーブル')
  await el.dblclick()
  const grid = page.getByRole('grid', { name: 'テーブル編集' })
  await expect(grid).toBeVisible()

  await expect(el.locator('[data-cell-id]')).toHaveCount(6)

  // Right-click the first body cell (DOM order: 3 header cells, then body)
  // and insert a row. The menu is portaled to <body>, and the editor exits
  // table-edit mode on any mousedown outside its container — a real mouse
  // click on a menu item unmounts the menu before the click completes, so the
  // item is activated with a synthetic click (no mousedown).
  await grid.locator('[data-cell-id]').nth(3).click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: '下に行を挿入' }).dispatchEvent('click')

  // 3 columns × 3 rows now.
  await expect(el.locator('[data-cell-id]')).toHaveCount(9)

  // And a column insert on the same table: 4 columns × 3 rows.
  await grid.locator('[data-cell-id]').nth(3).click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: '右に列を挿入' }).dispatchEvent('click')
  await expect(el.locator('[data-cell-id]')).toHaveCount(12)
})
