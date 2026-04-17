import { describe, it, expect } from 'vitest'
import type { FormTableElement, FormTableColumn, FormTableRow } from '@/types'
import { canMerge, mergeCells, splitCell, unmergeAffectedCells } from './tableMerge'

function makeElement(cols = 3, rows = 3): FormTableElement {
  const columns: FormTableColumn[] = Array.from({ length: cols }, (_, i) => ({
    id: `col-${i}`,
    width: 20,
    align: 'left' as const,
  }))
  const rowDefs: FormTableRow[] = Array.from({ length: rows }, (_, ri) => ({
    id: `row-${ri}`,
    role: 'body' as const,
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

describe('tableMerge — canMerge', () => {
  it('validates rectangular selection', () => {
    const el = makeElement()
    const ids = new Set(['cell-0-0', 'cell-0-1', 'cell-1-0', 'cell-1-1'])
    expect(canMerge(el, ids).valid).toBe(true)
  })

  it('rejects single cell', () => {
    const el = makeElement()
    expect(canMerge(el, new Set(['cell-0-0'])).valid).toBe(false)
  })

  it('rejects non-rectangular selection', () => {
    const el = makeElement()
    // L-shaped selection
    const ids = new Set(['cell-0-0', 'cell-0-1', 'cell-1-0'])
    expect(canMerge(el, ids).valid).toBe(false)
  })

  it('rejects cross-role merge', () => {
    const el = makeElement()
    el.rows[0].role = 'header'
    el.rows[1].role = 'body'
    const ids = new Set(['cell-0-0', 'cell-1-0'])
    const result = canMerge(el, ids)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('ロール')
  })
})

describe('tableMerge — mergeCells', () => {
  it('sets colspan/rowspan on master and mergedInto on slaves', () => {
    const el = makeElement()
    const ids = new Set(['cell-0-0', 'cell-0-1', 'cell-1-0', 'cell-1-1'])
    const patch = mergeCells(el, ids)

    const master = patch.rows![0].cells[0]
    expect(master.colspan).toBe(2)
    expect(master.rowspan).toBe(2)

    // Slave cells
    expect(patch.rows![0].cells[1].mergedInto).toBe('cell-0-0')
    expect(patch.rows![1].cells[0].mergedInto).toBe('cell-0-0')
    expect(patch.rows![1].cells[1].mergedInto).toBe('cell-0-0')

    // Unaffected cell
    expect(patch.rows![0].cells[2].mergedInto).toBeUndefined()
  })
})

describe('tableMerge — splitCell', () => {
  it('removes colspan/rowspan and mergedInto', () => {
    const el = makeElement()
    // First merge
    const merged = { ...el, ...mergeCells(el, new Set(['cell-0-0', 'cell-0-1', 'cell-1-0', 'cell-1-1'])) } as FormTableElement

    // Then split
    const patch = splitCell(merged, 'cell-0-0')
    const master = patch.rows![0].cells[0]
    expect(master.colspan).toBeUndefined()
    expect(master.rowspan).toBeUndefined()

    expect(patch.rows![0].cells[1].mergedInto).toBeUndefined()
    expect(patch.rows![1].cells[0].mergedInto).toBeUndefined()
    expect(patch.rows![1].cells[1].mergedInto).toBeUndefined()
  })
})

describe('tableMerge — unmergeAffectedCells', () => {
  it('unmerges cells when affected row is deleted', () => {
    const el = makeElement()
    const merged = { ...el, ...mergeCells(el, new Set(['cell-0-0', 'cell-1-0'])) } as FormTableElement

    // Deleting row 1 (which is part of the merge)
    const patch = unmergeAffectedCells(merged, 1)
    // Should have unmerged the master cell
    expect(patch.rows![0].cells[0].rowspan).toBeUndefined()
    expect(patch.rows![1].cells[0].mergedInto).toBeUndefined()
  })

  it('returns empty when no merges affected', () => {
    const el = makeElement()
    const patch = unmergeAffectedCells(el, 0)
    expect(Object.keys(patch).length).toBe(0)
  })
})
