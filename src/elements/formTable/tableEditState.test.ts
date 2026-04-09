import { describe, it, expect } from 'vitest'
import { tableEditReducer, INITIAL_TABLE_EDIT_STATE, type TableEditState } from './tableEditState'

describe('tableEditReducer', () => {
  it('SELECT_CELL sets mode to selecting', () => {
    const result = tableEditReducer(INITIAL_TABLE_EDIT_STATE, {
      type: 'SELECT_CELL',
      cellId: 'c1',
      coord: { row: 0, col: 0 },
    })
    expect(result.mode).toBe('selecting')
    expect(result.selectedCells.has('c1')).toBe(true)
    expect(result.activeCell).toBe('c1')
  })

  it('START_EDITING sets mode to editing', () => {
    const selecting: TableEditState = {
      ...INITIAL_TABLE_EDIT_STATE,
      mode: 'selecting',
      selectedCells: new Set(['c1']),
      activeCell: 'c1',
    }
    const result = tableEditReducer(selecting, {
      type: 'START_EDITING',
      cellId: 'c1',
    })
    expect(result.mode).toBe('editing')
    expect(result.activeCell).toBe('c1')
  })

  it('STOP_EDITING returns to selecting', () => {
    const editing: TableEditState = {
      ...INITIAL_TABLE_EDIT_STATE,
      mode: 'editing',
      activeCell: 'c1',
    }
    const result = tableEditReducer(editing, { type: 'STOP_EDITING' })
    expect(result.mode).toBe('selecting')
  })

  it('EXIT_MODE from editing goes to selecting', () => {
    const editing: TableEditState = {
      ...INITIAL_TABLE_EDIT_STATE,
      mode: 'editing',
      activeCell: 'c1',
    }
    const result = tableEditReducer(editing, { type: 'EXIT_MODE' })
    expect(result.mode).toBe('selecting')
  })

  it('EXIT_MODE from selecting resets to initial', () => {
    const selecting: TableEditState = {
      ...INITIAL_TABLE_EDIT_STATE,
      mode: 'selecting',
      selectedCells: new Set(['c1']),
      activeCell: 'c1',
    }
    const result = tableEditReducer(selecting, { type: 'EXIT_MODE' })
    expect(result.mode).toBe('none')
    expect(result.selectedCells.size).toBe(0)
    expect(result.activeCell).toBeNull()
  })

  it('MOVE_ACTIVE changes active cell and clears range', () => {
    const state: TableEditState = {
      ...INITIAL_TABLE_EDIT_STATE,
      mode: 'selecting',
      selectedCells: new Set(['c1', 'c2']),
      activeCell: 'c1',
    }
    const result = tableEditReducer(state, {
      type: 'MOVE_ACTIVE',
      coord: { row: 1, col: 0 },
      cellId: 'c3',
    })
    expect(result.activeCell).toBe('c3')
    expect(result.selectedCells.size).toBe(1)
    expect(result.selectedCells.has('c3')).toBe(true)
  })

  it('SET_SELECTED_CELLS replaces selection', () => {
    const state: TableEditState = {
      ...INITIAL_TABLE_EDIT_STATE,
      mode: 'selecting',
      selectedCells: new Set(['c1']),
    }
    const result = tableEditReducer(state, {
      type: 'SET_SELECTED_CELLS',
      cellIds: new Set(['c2', 'c3', 'c4']),
    })
    expect(result.selectedCells.size).toBe(3)
    expect(result.selectedCells.has('c2')).toBe(true)
  })
})
