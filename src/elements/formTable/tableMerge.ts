/**
 * Cell merge/split logic for FormTable.
 * Constraints:
 * - Only cells within the same row-role (header/body/footer) can be merged
 * - Selected cells must form a rectangle
 * - mergedInto tracks which master cell owns each hidden cell
 */

import type { FormTableElement, FormTableCell, FormTableRow } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CellPosition {
  rowIdx: number
  colIdx: number
  cell: FormTableCell
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find all cell positions matching the given IDs */
function findCellPositions(
  el: FormTableElement,
  cellIds: Set<string>,
): CellPosition[] {
  const positions: CellPosition[] = []
  for (let r = 0; r < el.rows.length; r++) {
    for (let c = 0; c < el.rows[r].cells.length; c++) {
      if (cellIds.has(el.rows[r].cells[c].id)) {
        positions.push({ rowIdx: r, colIdx: c, cell: el.rows[r].cells[c] })
      }
    }
  }
  return positions
}

/** Check if positions form a rectangle and are within the same role */
function validateMergeRect(
  el: FormTableElement,
  positions: CellPosition[],
): { valid: boolean; minRow: number; maxRow: number; minCol: number; maxCol: number; reason?: string } {
  if (positions.length < 2) {
    return { valid: false, minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, reason: '2つ以上のセルを選択してください' }
  }

  const minRow = Math.min(...positions.map((p) => p.rowIdx))
  const maxRow = Math.max(...positions.map((p) => p.rowIdx))
  const minCol = Math.min(...positions.map((p) => p.colIdx))
  const maxCol = Math.max(...positions.map((p) => p.colIdx))

  // Check same role
  const roles = new Set(positions.map((p) => el.rows[p.rowIdx].role))
  if (roles.size > 1) {
    return { valid: false, minRow, maxRow, minCol, maxCol, reason: '異なるロール（header/body/footer）をまたぐ結合はできません' }
  }

  // Check rectangle completeness
  const expectedCount = (maxRow - minRow + 1) * (maxCol - minCol + 1)
  if (positions.length !== expectedCount) {
    return { valid: false, minRow, maxRow, minCol, maxCol, reason: '矩形範囲を選択してください' }
  }

  // Check no already-merged cells in the range
  for (const pos of positions) {
    if (pos.cell.mergedInto) {
      return { valid: false, minRow, maxRow, minCol, maxCol, reason: '既に結合されたセルが含まれています' }
    }
  }

  return { valid: true, minRow, maxRow, minCol, maxCol }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if selected cells can be merged */
export function canMerge(
  el: FormTableElement,
  selectedCellIds: Set<string>,
): { valid: boolean; reason?: string } {
  const positions = findCellPositions(el, selectedCellIds)
  const result = validateMergeRect(el, positions)
  return { valid: result.valid, reason: result.reason }
}

/** Merge selected cells into one. The top-left cell becomes the master. */
export function mergeCells(
  el: FormTableElement,
  selectedCellIds: Set<string>,
): Partial<FormTableElement> {
  const positions = findCellPositions(el, selectedCellIds)
  const rect = validateMergeRect(el, positions)
  if (!rect.valid) return {}

  const { minRow, maxRow, minCol, maxCol } = rect
  const colspan = maxCol - minCol + 1
  const rowspan = maxRow - minRow + 1
  const masterCell = el.rows[minRow].cells[minCol]

  return {
    rows: el.rows.map((row, ri): FormTableRow => ({
      ...row,
      cells: row.cells.map((cell, ci): FormTableCell => {
        if (ri === minRow && ci === minCol) {
          // Master cell — set colspan/rowspan
          return { ...cell, colspan, rowspan }
        }
        if (ri >= minRow && ri <= maxRow && ci >= minCol && ci <= maxCol) {
          // Slave cells — mark as merged
          return { ...cell, mergedInto: masterCell.id }
        }
        return cell
      }),
    })),
  }
}

/** Split a merged cell back into individual cells */
export function splitCell(
  el: FormTableElement,
  cellId: string,
): Partial<FormTableElement> {
  return {
    rows: el.rows.map((row): FormTableRow => ({
      ...row,
      cells: row.cells.map((cell): FormTableCell => {
        if (cell.id === cellId) {
          // Remove merge from master
          const { colspan: _, rowspan: __, ...rest } = cell
          return rest
        }
        if (cell.mergedInto === cellId) {
          // Unmerge slave cells
          const { mergedInto: _, ...rest } = cell
          return rest
        }
        return cell
      }),
    })),
  }
}

/** Auto-unmerge any cells affected by a row/column deletion */
export function unmergeAffectedCells(
  el: FormTableElement,
  deletedRowIdx?: number,
  deletedColIdx?: number,
): Partial<FormTableElement> {
  // Find all master cells whose merge range intersects the deleted row/col
  const masterIdsToSplit = new Set<string>()

  for (let r = 0; r < el.rows.length; r++) {
    for (let c = 0; c < el.rows[r].cells.length; c++) {
      const cell = el.rows[r].cells[c]
      const colspan = cell.colspan ?? 1
      const rowspan = cell.rowspan ?? 1

      if (colspan <= 1 && rowspan <= 1) continue

      // Check if this merged cell is affected
      if (deletedRowIdx !== undefined && r <= deletedRowIdx && r + rowspan - 1 >= deletedRowIdx) {
        masterIdsToSplit.add(cell.id)
      }
      if (deletedColIdx !== undefined && c <= deletedColIdx && c + colspan - 1 >= deletedColIdx) {
        masterIdsToSplit.add(cell.id)
      }
    }
  }

  if (masterIdsToSplit.size === 0) return {}

  // Unmerge all affected master cells
  let result = el
  for (const masterId of masterIdsToSplit) {
    const patch = splitCell(result, masterId)
    result = { ...result, ...patch } as FormTableElement
  }

  return { rows: result.rows }
}
