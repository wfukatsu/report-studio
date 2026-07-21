/**
 * Pure functions for formTable row/column/cell operations.
 * Shared between PropertiesPanel and inline editing.
 */

import { v4 as uuidv4 } from 'uuid'
import type { TFunction } from 'i18next'
import type {
  FormTableElement,
  FormTableColumn,
  FormTableRow,
  FormTableCell,
  FormTableCellType,
} from '@/types'

// ---------------------------------------------------------------------------
// Column operations
// ---------------------------------------------------------------------------

export function addColumn(el: FormTableElement): Partial<FormTableElement> {
  const newCol: FormTableColumn = { id: uuidv4(), width: 20, align: 'left' }
  const newCell = (): FormTableCell => ({ id: uuidv4(), type: 'input', placeholder: '' })
  return {
    columns: [...el.columns, newCol],
    rows: el.rows.map((r) => ({ ...r, cells: [...r.cells, newCell()] })),
  }
}

export function removeColumn(el: FormTableElement, colIdx: number): Partial<FormTableElement> {
  if (el.columns.length <= 1) return {} // Prevent removing last column
  return {
    columns: el.columns.filter((_, i) => i !== colIdx),
    rows: el.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== colIdx) })),
  }
}

export function updateColumn(
  el: FormTableElement,
  colIdx: number,
  patch: Partial<FormTableColumn>,
): Partial<FormTableElement> {
  return {
    columns: el.columns.map((c, i): FormTableColumn => (i === colIdx ? { ...c, ...patch } : c)),
  }
}

export function insertColumnAt(
  el: FormTableElement,
  colIdx: number,
  position: 'before' | 'after',
): Partial<FormTableElement> {
  const insertIdx = position === 'before' ? colIdx : colIdx + 1
  const newCol: FormTableColumn = { id: uuidv4(), width: 20, align: 'left' }
  const newCell = (): FormTableCell => ({ id: uuidv4(), type: 'input', placeholder: '' })
  const columns = [...el.columns]
  columns.splice(insertIdx, 0, newCol)
  return {
    columns,
    rows: el.rows.map((r) => {
      const cells = [...r.cells]
      cells.splice(insertIdx, 0, newCell())
      return { ...r, cells }
    }),
  }
}

export function moveColumn(
  el: FormTableElement,
  fromIdx: number,
  toIdx: number,
): Partial<FormTableElement> {
  if (fromIdx === toIdx) return {}
  const columns = [...el.columns]
  const [col] = columns.splice(fromIdx, 1)
  columns.splice(toIdx, 0, col)
  return {
    columns,
    rows: el.rows.map((r) => {
      const cells = [...r.cells]
      const [cell] = cells.splice(fromIdx, 1)
      cells.splice(toIdx, 0, cell)
      return { ...r, cells }
    }),
  }
}

// ---------------------------------------------------------------------------
// Row operations
// ---------------------------------------------------------------------------

export function addRow(el: FormTableElement): Partial<FormTableElement> {
  const newRow: FormTableRow = {
    id: uuidv4(),
    role: 'body',
    height: 8,
    cells: el.columns.map(() => ({ id: uuidv4(), type: 'input' as const, placeholder: '' })),
  }
  return { rows: [...el.rows, newRow] }
}

export function removeRow(el: FormTableElement, rowIdx: number): Partial<FormTableElement> {
  if (el.rows.length <= 1) return {} // Prevent removing last row
  return { rows: el.rows.filter((_, i) => i !== rowIdx) }
}

export function updateRow(
  el: FormTableElement,
  rowIdx: number,
  patch: Omit<Partial<FormTableRow>, 'cells'>,
): Partial<FormTableElement> {
  return {
    rows: el.rows.map((r, i): FormTableRow => (i === rowIdx ? { ...r, ...patch } : r)),
  }
}

export function insertRowAt(
  el: FormTableElement,
  rowIdx: number,
  position: 'before' | 'after',
): Partial<FormTableElement> {
  const insertIdx = position === 'before' ? rowIdx : rowIdx + 1
  const referenceRow = el.rows[rowIdx]
  const newRow: FormTableRow = {
    id: uuidv4(),
    role: referenceRow?.role ?? 'body',
    height: referenceRow?.height ?? 8,
    cells: el.columns.map(() => ({ id: uuidv4(), type: 'input' as const, placeholder: '' })),
  }
  const rows = [...el.rows]
  rows.splice(insertIdx, 0, newRow)
  return { rows }
}

export function moveRow(
  el: FormTableElement,
  fromIdx: number,
  toIdx: number,
): Partial<FormTableElement> {
  if (fromIdx === toIdx) return {}
  const rows = [...el.rows]
  const [row] = rows.splice(fromIdx, 1)
  rows.splice(toIdx, 0, row)
  return { rows }
}

// ---------------------------------------------------------------------------
// Cell operations
// ---------------------------------------------------------------------------

export function updateCell(
  el: FormTableElement,
  rowIdx: number,
  colIdx: number,
  patch: Partial<FormTableCell>,
): Partial<FormTableElement> {
  return {
    rows: el.rows.map((r, ri): FormTableRow =>
      ri === rowIdx
        ? { ...r, cells: r.cells.map((c, ci): FormTableCell => (ci === colIdx ? { ...c, ...patch } : c)) }
        : r,
    ),
  }
}

export function updateCellById(
  el: FormTableElement,
  cellId: string,
  patch: Partial<FormTableCell>,
): Partial<FormTableElement> {
  return {
    rows: el.rows.map((r): FormTableRow => ({
      ...r,
      cells: r.cells.map((c): FormTableCell => (c.id === cellId ? { ...c, ...patch } : c)),
    })),
  }
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

export function selectRow(el: FormTableElement, rowIdx: number): string[] {
  return el.rows[rowIdx]?.cells.map((c) => c.id) ?? []
}

export function selectColumn(el: FormTableElement, colIdx: number): string[] {
  return el.rows.map((r) => r.cells[colIdx]?.id).filter(Boolean) as string[]
}

// ---------------------------------------------------------------------------
// Cell type options (shared constants)
// ---------------------------------------------------------------------------

export function cellTypeOptions(
  t: TFunction<'elements'>,
): { value: FormTableCellType; label: string }[] {
  return [
    { value: 'label', label: t('formTable.cellType.label') },
    { value: 'input', label: t('formTable.cellType.input') },
    { value: 'dataField', label: t('formTable.cellType.dataField') },
  ]
}

export function rowRoleOptions(
  t: TFunction<'elements'>,
): { value: string; label: string }[] {
  return [
    { value: 'header', label: t('formTable.rowRole.header') },
    { value: 'body', label: t('formTable.rowRole.body') },
    { value: 'footer', label: t('formTable.rowRole.footer') },
  ]
}

export function alignOptions(
  t: TFunction<'elements'>,
): { value: string; label: string }[] {
  return [
    { value: 'left', label: t('formTable.align.left') },
    { value: 'center', label: t('formTable.align.center') },
    { value: 'right', label: t('formTable.align.right') },
  ]
}
