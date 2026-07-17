import { describe, it, expect } from 'vitest'
import { getGroupColor, GROUP_COLORS, isBindableType, BINDABLE_TYPES } from './types'

describe('getGroupColor', () => {
  it('returns the palette color for in-range indices', () => {
    expect(getGroupColor(0)).toBe('#3b82f6')
    expect(getGroupColor(1)).toBe('#10b981')
    expect(getGroupColor(7)).toBe('#ec4899')
  })

  it('wraps around when the index exceeds the palette size', () => {
    expect(getGroupColor(8)).toBe(GROUP_COLORS[0])
    expect(getGroupColor(9)).toBe(GROUP_COLORS[1])
    expect(getGroupColor(15)).toBe(GROUP_COLORS[7])
    expect(getGroupColor(16)).toBe(GROUP_COLORS[0])
  })
})

describe('isBindableType', () => {
  it.each([...BINDABLE_TYPES])('returns true for bindable type "%s"', (type) => {
    expect(isBindableType(type)).toBe(true)
  })

  it.each([
    'shape', 'image', 'formTable', 'repeatingBand', 'repeatingList',
    'chart', 'barcode', 'label', 'pageNumber', 'hanko',
  ])('returns false for non-bindable type "%s"', (type) => {
    expect(isBindableType(type)).toBe(false)
  })

  it('returns false for unknown/empty type strings', () => {
    expect(isBindableType('')).toBe(false)
    expect(isBindableType('DataField')).toBe(false) // case-sensitive
  })
})
