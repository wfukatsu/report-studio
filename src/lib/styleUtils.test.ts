import { describe, it, expect } from 'vitest'
import { resolveStyle, resolveFontFamily, REPORT_SANS_STACK, REPORT_SERIF_STACK } from './styleUtils'
import type { TextStyle } from '@/types'

describe('resolveStyle', () => {
  const defaultStyle: TextStyle = {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#000000',
    textAlign: 'left',
  }

  it('returns a copy of defaultStyle when elStyle is undefined', () => {
    const result = resolveStyle(undefined, defaultStyle)
    expect(result).toEqual(defaultStyle)
    expect(result).not.toBe(defaultStyle) // new object, not the same reference
  })

  it('returns a copy of defaultStyle when elStyle is empty', () => {
    const result = resolveStyle({}, defaultStyle)
    expect(result).toEqual(defaultStyle)
  })

  it('element-level values override defaultStyle', () => {
    const elStyle: TextStyle = { fontSize: 20, color: '#ff0000' }
    const result = resolveStyle(elStyle, defaultStyle)
    expect(result.fontSize).toBe(20)
    expect(result.color).toBe('#ff0000')
    // Unset props inherit from default
    expect(result.fontWeight).toBe('normal')
    expect(result.textAlign).toBe('left')
  })

  it('undefined values in elStyle do NOT override defaultStyle (undefined-override bug prevention)', () => {
    // This is the critical bug case: `{ ...defaultStyle, ...elStyle }` would
    // set fontSize to undefined, overriding defaultStyle.fontSize
    const elStyle: TextStyle = { fontSize: undefined, fontWeight: 'bold' }
    const result = resolveStyle(elStyle, defaultStyle)
    expect(result.fontSize).toBe(12) // must NOT be undefined
    expect(result.fontWeight).toBe('bold')
  })

  it('does not mutate elStyle or defaultStyle', () => {
    const elStyle: TextStyle = { fontSize: 16 }
    const originalElStyle = { ...elStyle }
    const originalDefault = { ...defaultStyle }
    resolveStyle(elStyle, defaultStyle)
    expect(elStyle).toEqual(originalElStyle)
    expect(defaultStyle).toEqual(originalDefault)
  })

  it('handles defaultStyle with empty values — elStyle overrides everything', () => {
    const emptyDefault: TextStyle = {}
    const elStyle: TextStyle = { fontSize: 14, color: '#blue' }
    const result = resolveStyle(elStyle, emptyDefault)
    expect(result.fontSize).toBe(14)
    expect(result.color).toBe('#blue')
  })

  it('handles all TextStyle fields', () => {
    const fullDefault: TextStyle = {
      fontSize: 10,
      fontFamily: 'Noto Sans JP',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      color: '#000000',
      backgroundColor: 'transparent',
      textAlign: 'left',
      verticalAlign: 'top',
      letterSpacing: 0,
      lineHeight: 1.5,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      writingMode: 'horizontal-tb',
    }
    const elStyle: TextStyle = { fontSize: 20, writingMode: 'vertical-rl' }
    const result = resolveStyle(elStyle, fullDefault)
    expect(result.fontSize).toBe(20)
    expect(result.writingMode).toBe('vertical-rl')
    expect(result.fontFamily).toBe('Noto Sans JP') // inherited
    expect(result.lineHeight).toBe(1.5) // inherited
  })
})

describe('resolveFontFamily (#317)', () => {
  it('resolves the generic sans-serif keyword to the Noto Sans JP stack', () => {
    expect(resolveFontFamily('sans-serif')).toBe(REPORT_SANS_STACK)
  })

  it('resolves the generic serif keyword to the Noto Serif JP stack', () => {
    expect(resolveFontFamily('serif')).toBe(REPORT_SERIF_STACK)
  })

  it('passes explicit families through unchanged', () => {
    expect(resolveFontFamily('Noto Sans JP')).toBe('Noto Sans JP')
    expect(resolveFontFamily('Yu Mincho')).toBe('Yu Mincho')
    expect(resolveFontFamily('monospace')).toBe('monospace')
  })

  it('returns undefined for unset families so .report-page inheritance applies', () => {
    expect(resolveFontFamily(undefined)).toBeUndefined()
    expect(resolveFontFamily('')).toBeUndefined()
  })
})
