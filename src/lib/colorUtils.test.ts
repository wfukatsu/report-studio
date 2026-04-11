import { describe, it, expect } from 'vitest'
import { isValidHex, expandHex, PRESET_COLOR_COLUMNS } from './colorUtils'

describe('isValidHex', () => {
  it('accepts #RRGGBB format', () => { expect(isValidHex('#E74C3C')).toBe(true) })
  it('accepts lowercase', () => { expect(isValidHex('#e74c3c')).toBe(true) })
  it('rejects #RGB (use expandHex first)', () => { expect(isValidHex('#E7C')).toBe(false) })
  it('rejects without # prefix', () => { expect(isValidHex('E74C3C')).toBe(false) })
  it('rejects too short', () => { expect(isValidHex('#E74C3')).toBe(false) })
  it('rejects empty string', () => { expect(isValidHex('')).toBe(false) })
})

describe('expandHex', () => {
  it('expands #RGB to #RRGGBB', () => { expect(expandHex('#ABC')).toBe('#AABBCC') })
  it('leaves #RRGGBB unchanged', () => { expect(expandHex('#AABBCC')).toBe('#AABBCC') })
  it('returns invalid strings unchanged', () => { expect(expandHex('invalid')).toBe('invalid') })
  it('handles all-zero shorthand', () => { expect(expandHex('#000')).toBe('#000000') })
  it('handles mixed case', () => { expect(expandHex('#AbC')).toBe('#AAbbCC') })
})

describe('PRESET_COLOR_COLUMNS', () => {
  it('has exactly 10 columns', () => { expect(PRESET_COLOR_COLUMNS.length).toBe(10) })
  it('each column has exactly 6 shades', () => {
    PRESET_COLOR_COLUMNS.forEach((col) => expect(col.length).toBe(6))
  })
  it('all entries are valid #RRGGBB hex values', () => {
    PRESET_COLOR_COLUMNS.forEach((col) =>
      col.forEach((hex) => expect(isValidHex(hex)).toBe(true)),
    )
  })
  it('all entries are uppercase', () => {
    PRESET_COLOR_COLUMNS.forEach((col) =>
      col.forEach((hex) => expect(hex).toBe(hex.toUpperCase())),
    )
  })
  it('no duplicate colors within a column', () => {
    PRESET_COLOR_COLUMNS.forEach((col) => {
      const unique = new Set(col.map((h) => h.toLowerCase()))
      expect(unique.size).toBe(col.length)
    })
  })
})
