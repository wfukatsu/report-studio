import { describe, it, expect } from 'vitest'
import type { FormTableElement, FormTableColumn, FormTableRow } from '@/types'
import {
  addColumn,
  removeColumn,
  insertColumnAt,
  moveColumn,
  addRow,
  removeRow,
  insertRowAt,
  moveRow,
  updateCell,
  updateCellById,
  selectRow,
  selectColumn,
} from './tableOperations'

function makeElement(cols = 3, rows = 2): FormTableElement {
  const columns: FormTableColumn[] = Array.from({ length: cols }, (_, i) => ({
    id: `col-${i}`,
    width: 20,
    align: 'left' as const,
  }))
  const rowDefs: FormTableRow[] = Array.from({ length: rows }, (_, ri) => ({
    id: `row-${ri}`,
    role: ri === 0 ? ('header' as const) : ('body' as const),
    height: 8,
    cells: columns.map((_, ci) => ({
      id: `cell-${ri}-${ci}`,
      type: 'label' as const,
      text: `R${ri}C${ci}`,
    })),
  }))
  return {
    id: 'table-1',
    type: 'formTable',
    name: 'Test Table',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    zIndex: 1,
    locked: false,
    visible: true,
    columns,
    rows: rowDefs,
    borderColor: '#000',
    borderWidth: 0.3,
  }
}

describe('tableOperations — column', () => {
  it('addColumn appends a column and cells', () => {
    const el = makeElement(2, 2)
    const patch = addColumn(el)
    expect(patch.columns!.length).toBe(3)
    expect(patch.rows![0].cells.length).toBe(3)
    expect(patch.rows![1].cells.length).toBe(3)
  })

  it('removeColumn removes column and corresponding cells', () => {
    const el = makeElement(3, 2)
    const patch = removeColumn(el, 1)
    expect(patch.columns!.length).toBe(2)
    expect(patch.rows![0].cells.length).toBe(2)
    expect(patch.rows![0].cells[0].text).toBe('R0C0')
    expect(patch.rows![0].cells[1].text).toBe('R0C2')
  })

  it('removeColumn prevents removing last column', () => {
    const el = makeElement(1, 1)
    const patch = removeColumn(el, 0)
    expect(Object.keys(patch).length).toBe(0)
  })

  it('insertColumnAt inserts before', () => {
    const el = makeElement(2, 1)
    const patch = insertColumnAt(el, 1, 'before')
    expect(patch.columns!.length).toBe(3)
    expect(patch.columns![0].id).toBe('col-0')
    // New column is at index 1
    expect(patch.columns![2].id).toBe('col-1')
    expect(patch.rows![0].cells.length).toBe(3)
  })

  it('moveColumn swaps columns and cells', () => {
    const el = makeElement(3, 1)
    const patch = moveColumn(el, 0, 2)
    expect(patch.columns![0].id).toBe('col-1')
    expect(patch.columns![1].id).toBe('col-2')
    expect(patch.columns![2].id).toBe('col-0')
    expect(patch.rows![0].cells[2].text).toBe('R0C0')
  })
})

describe('tableOperations — row', () => {
  it('addRow appends a body row', () => {
    const el = makeElement(2, 1)
    const patch = addRow(el)
    expect(patch.rows!.length).toBe(2)
    expect(patch.rows![1].role).toBe('body')
    expect(patch.rows![1].cells.length).toBe(2)
  })

  it('removeRow prevents removing last row', () => {
    const el = makeElement(2, 1)
    const patch = removeRow(el, 0)
    expect(Object.keys(patch).length).toBe(0)
  })

  it('insertRowAt inserts after', () => {
    const el = makeElement(2, 2)
    const patch = insertRowAt(el, 0, 'after')
    expect(patch.rows!.length).toBe(3)
    expect(patch.rows![1].role).toBe('header') // inherits role from reference
    expect(patch.rows![1].cells.length).toBe(2)
  })

  it('moveRow swaps rows', () => {
    const el = makeElement(2, 3)
    const patch = moveRow(el, 0, 2)
    expect(patch.rows![0].id).toBe('row-1')
    expect(patch.rows![2].id).toBe('row-0')
  })
})

describe('tableOperations — cell', () => {
  it('updateCell patches a specific cell', () => {
    const el = makeElement(2, 2)
    const patch = updateCell(el, 0, 1, { text: 'updated' })
    expect(patch.rows![0].cells[1].text).toBe('updated')
    expect(patch.rows![0].cells[0].text).toBe('R0C0') // unchanged
  })

  it('updateCellById patches by ID', () => {
    const el = makeElement(2, 2)
    const patch = updateCellById(el, 'cell-1-0', { text: 'by-id' })
    expect(patch.rows![1].cells[0].text).toBe('by-id')
  })
})

describe('tableOperations — selection helpers', () => {
  it('selectRow returns cell IDs for a row', () => {
    const el = makeElement(3, 2)
    const ids = selectRow(el, 0)
    expect(ids).toEqual(['cell-0-0', 'cell-0-1', 'cell-0-2'])
  })

  it('selectColumn returns cell IDs for a column', () => {
    const el = makeElement(3, 2)
    const ids = selectColumn(el, 1)
    expect(ids).toEqual(['cell-0-1', 'cell-1-1'])
  })
})
