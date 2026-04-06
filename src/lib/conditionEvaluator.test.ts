import { describe, it, expect } from 'vitest'
import { evaluateConditionalDisplay } from './conditionEvaluator'
import type { ConditionalDisplay } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function andCd(...conditions: ConditionalDisplay['conditions']): ConditionalDisplay {
  return { logic: 'and', conditions }
}

function orCd(...conditions: ConditionalDisplay['conditions']): ConditionalDisplay {
  return { logic: 'or', conditions }
}

const data = {
  name: 'Alice',
  status: 'active',
  amount: 1500,
  empty_field: '',
  nested: { city: 'Tokyo' },
  items: [
    { product: 'Widget', qty: 3 },
    { product: 'Gadget', qty: 0 },
  ],
}

// ---------------------------------------------------------------------------
// Empty conditions
// ---------------------------------------------------------------------------

describe('empty conditions', () => {
  it('AND with no conditions → true', () => {
    expect(evaluateConditionalDisplay(andCd(), data)).toBe(true)
  })

  it('OR with no conditions → true', () => {
    expect(evaluateConditionalDisplay(orCd(), data)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AND logic
// ---------------------------------------------------------------------------

describe('AND logic', () => {
  it('all true → visible', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'status', operator: 'equals', value: 'active' },
      { id: '2', fieldPath: 'amount', operator: 'greater_than', value: 1000 },
    ), data)).toBe(true)
  })

  it('one false → hidden', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'status', operator: 'equals', value: 'active' },
      { id: '2', fieldPath: 'amount', operator: 'greater_than', value: 2000 },
    ), data)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// OR logic
// ---------------------------------------------------------------------------

describe('OR logic', () => {
  it('one true → visible', () => {
    expect(evaluateConditionalDisplay(orCd(
      { id: '1', fieldPath: 'status', operator: 'equals', value: 'inactive' },
      { id: '2', fieldPath: 'amount', operator: 'greater_than', value: 1000 },
    ), data)).toBe(true)
  })

  it('all false → hidden', () => {
    expect(evaluateConditionalDisplay(orCd(
      { id: '1', fieldPath: 'status', operator: 'equals', value: 'inactive' },
      { id: '2', fieldPath: 'amount', operator: 'greater_than', value: 2000 },
    ), data)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

describe('equals / not_equals', () => {
  it('equals match', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'status', operator: 'equals', value: 'active' },
    ), data)).toBe(true)
  })

  it('equals mismatch', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'status', operator: 'equals', value: 'inactive' },
    ), data)).toBe(false)
  })

  it('not_equals match', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'status', operator: 'not_equals', value: 'inactive' },
    ), data)).toBe(true)
  })
})

describe('greater_than / less_than', () => {
  it('greater_than true', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'amount', operator: 'greater_than', value: 1000 },
    ), data)).toBe(true)
  })

  it('greater_than false', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'amount', operator: 'greater_than', value: 2000 },
    ), data)).toBe(false)
  })

  it('less_than true', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'amount', operator: 'less_than', value: 2000 },
    ), data)).toBe(true)
  })

  it('greater_than returns false when field is missing', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'nonexistent', operator: 'greater_than', value: 0 },
    ), data)).toBe(false)
  })

  it('greater_than with non-numeric field → NaN comparison → false', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'name', operator: 'greater_than', value: 0 },
    ), data)).toBe(false)
  })
})

describe('contains / not_contains', () => {
  it('contains match', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'name', operator: 'contains', value: 'lic' },
    ), data)).toBe(true)
  })

  it('contains mismatch', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'name', operator: 'contains', value: 'Bob' },
    ), data)).toBe(false)
  })

  it('not_contains match', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'name', operator: 'not_contains', value: 'Bob' },
    ), data)).toBe(true)
  })
})

describe('empty / not_empty', () => {
  it('empty: empty string → true', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'empty_field', operator: 'empty' },
    ), data)).toBe(true)
  })

  it('empty: non-empty string → false', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'name', operator: 'empty' },
    ), data)).toBe(false)
  })

  it('empty: undefined field → true', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'nonexistent', operator: 'empty' },
    ), data)).toBe(true)
  })

  it('not_empty: non-empty string → true', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'name', operator: 'not_empty' },
    ), data)).toBe(true)
  })

  it('not_empty: empty string → false', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'empty_field', operator: 'not_empty' },
    ), data)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Nested paths
// ---------------------------------------------------------------------------

describe('nested path (dot notation)', () => {
  it('resolves nested.city', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'nested.city', operator: 'equals', value: 'Tokyo' },
    ), data)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Detail row access (group[].field)
// ---------------------------------------------------------------------------

describe('detail row access (group[].field)', () => {
  it('resolves items[].product for row 0', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'items[].product', operator: 'equals', value: 'Widget' },
    ), data, 0)).toBe(true)
  })

  it('resolves items[].qty for row 1', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'items[].qty', operator: 'equals', value: '0' },
    ), data, 1)).toBe(true)
  })

  it('returns false when rowIndex not provided for detail path', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'items[].product', operator: 'not_empty' },
    ), data)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// FORBIDDEN_KEYS — prototype pollution guard
// ---------------------------------------------------------------------------

describe('FORBIDDEN_KEYS protection', () => {
  it('__proto__ fieldPath returns undefined → treated as empty', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: '__proto__', operator: 'empty' },
    ), data)).toBe(true)
  })

  it('constructor fieldPath returns undefined → treated as empty', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'constructor', operator: 'empty' },
    ), data)).toBe(true)
  })

  it('prototype in detail groupKey → undefined → empty', () => {
    expect(evaluateConditionalDisplay(andCd(
      { id: '1', fieldPath: 'prototype[].field', operator: 'empty' },
    ), data, 0)).toBe(true)
  })
})
