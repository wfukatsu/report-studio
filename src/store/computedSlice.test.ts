import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from './index'

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().invalidateComputed()
})

describe('computedSlice — setComputedResults', () => {
  it('stores results without changing loading state', () => {
    // setComputedResults does NOT clear computedLoading — loading is managed
    // by useEvaluator's finally block (single responsibility).
    useReportStore.getState().setComputedLoading(true)
    useReportStore.getState().setComputedResults({
      results: { subtotal: 5000, total: 5500 },
      errors: {},
    })

    const s = useReportStore.getState()
    expect(s.computedValues).toEqual({ subtotal: 5000, total: 5500 })
    expect(s.computedErrors).toEqual({})
    expect(s.computedLoading).toBe(true)  // loading unchanged — caller's responsibility
  })

  it('accepts null values (Java null → JS null)', () => {
    useReportStore.getState().setComputedResults({
      results: { nullableField: null },
      errors: {},
    })
    expect(useReportStore.getState().computedValues['nullableField']).toBeNull()
  })

  it('stores errors alongside results', () => {
    useReportStore.getState().setComputedResults({
      results: { a: 10 },
      errors: { b: 'circular reference detected' },
    })

    const s = useReportStore.getState()
    expect(s.computedValues['a']).toBe(10)
    expect(s.computedErrors['b']).toBe('circular reference detected')
  })
})

describe('computedSlice — setComputedLoading', () => {
  it('sets loading to true', () => {
    useReportStore.getState().setComputedLoading(true)
    expect(useReportStore.getState().computedLoading).toBe(true)
  })

  it('sets loading to false', () => {
    useReportStore.getState().setComputedLoading(true)
    useReportStore.getState().setComputedLoading(false)
    expect(useReportStore.getState().computedLoading).toBe(false)
  })
})

describe('computedSlice — setComputedViolations', () => {
  it('stores validation violations', () => {
    useReportStore.getState().setComputedViolations([
      { ruleKey: 'required-check', message: '必須項目です', elementId: 'el-1' },
    ])
    const violations = useReportStore.getState().computedViolations
    expect(violations).toHaveLength(1)
    expect(violations[0].ruleKey).toBe('required-check')
  })

  it('replaces existing violations', () => {
    useReportStore.getState().setComputedViolations([
      { ruleKey: 'a', message: 'A' },
      { ruleKey: 'b', message: 'B' },
    ])
    useReportStore.getState().setComputedViolations([
      { ruleKey: 'c', message: 'C' },
    ])
    expect(useReportStore.getState().computedViolations).toHaveLength(1)
  })
})

describe('computedSlice — invalidateComputed', () => {
  it('resets all computed state', () => {
    useReportStore.getState().setComputedResults({ results: { x: 1 }, errors: { y: 'err' } })
    useReportStore.getState().setComputedViolations([{ ruleKey: 'z', message: 'Z' }])
    useReportStore.getState().setComputedLoading(true)

    useReportStore.getState().invalidateComputed()

    const s = useReportStore.getState()
    expect(s.computedValues).toEqual({})
    expect(s.computedErrors).toEqual({})
    expect(s.computedViolations).toEqual([])
    expect(s.computedLoading).toBe(false)
  })
})

describe('computedSlice — not affected by undo/redo', () => {
  it('computed state survives undo', () => {
    // Set some computed values
    useReportStore.getState().setComputedResults({
      results: { total: 100 },
      errors: {},
    })

    // Perform an action that pushes history
    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, {
      id: 'el-test',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 20 },
      zIndex: 1,
      locked: false,
      visible: true,
      content: 'test',
      style: {},
    })

    // Undo the add
    useReportStore.getState().undo()

    // Computed values should be unaffected by undo
    expect(useReportStore.getState().computedValues).toEqual({ total: 100 })
  })
})
