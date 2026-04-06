import { describe, it, expect } from 'vitest'
import { aggregateField } from './aggregation'

const records = [
  { price: '100', qty: '3' },
  { price: '200', qty: '1' },
  { price: '50', qty: '5' },
]

describe('aggregateField', () => {
  it('sum returns total of numeric field', () => {
    expect(aggregateField(records, 'price', 'sum')).toBe(350)
  })

  it('count returns number of records', () => {
    expect(aggregateField(records, 'price', 'count')).toBe(3)
  })

  it('avg returns average value', () => {
    expect(aggregateField(records, 'price', 'avg')).toBeCloseTo(116.67, 1)
  })

  it('min returns minimum value', () => {
    expect(aggregateField(records, 'price', 'min')).toBe(50)
  })

  it('max returns maximum value', () => {
    expect(aggregateField(records, 'price', 'max')).toBe(200)
  })

  it('returns 0 for empty records', () => {
    expect(aggregateField([], 'price', 'sum')).toBe(0)
    expect(aggregateField([], 'price', 'count')).toBe(0)
    expect(aggregateField([], 'price', 'avg')).toBe(0)
    expect(aggregateField([], 'price', 'min')).toBe(0)
    expect(aggregateField([], 'price', 'max')).toBe(0)
  })

  it('treats non-numeric values as 0 without throwing', () => {
    const bad = [{ price: 'abc' }, { price: '100' }]
    expect(aggregateField(bad, 'price', 'sum')).toBe(100)
  })

  it('min/max with 1001 records does not throw', () => {
    const records = Array.from({ length: 1001 }, (_, i) => ({ value: i }))
    expect(aggregateField(records, 'value', 'min')).toBe(0)
    expect(aggregateField(records, 'value', 'max')).toBe(1000)
  })

  it('handles nested field keys via dot notation', () => {
    const nested = [{ item: { price: '40' } }, { item: { price: '60' } }]
    expect(aggregateField(nested as unknown as Record<string, unknown>[], 'item.price', 'sum')).toBe(100)
  })
})
