import { describe, it, expect } from 'vitest'
import { formatCurrentDate } from './format'

// Use a fixed date for deterministic tests: 2026-04-10 (Thursday)
const FIXED = new Date(2026, 3, 10)

describe('formatCurrentDate', () => {
  it('formats yyyy/MM/dd', () => {
    expect(formatCurrentDate('yyyy/MM/dd', undefined, FIXED)).toBe('2026/04/10')
  })

  it('formats yyyy年MM月dd日', () => {
    expect(formatCurrentDate('yyyy年MM月dd日', undefined, FIXED)).toBe('2026年04月10日')
  })

  it('formats yyyy-MM-dd', () => {
    expect(formatCurrentDate('yyyy-MM-dd', undefined, FIXED)).toBe('2026-04-10')
  })

  it('formats MM/dd/yyyy', () => {
    expect(formatCurrentDate('MM/dd/yyyy', undefined, FIXED)).toBe('04/10/2026')
  })

  it('formats wareki_full', () => {
    expect(formatCurrentDate('wareki_full', undefined, FIXED)).toBe('令和8年04月10日')
  })

  it('formats wareki_short', () => {
    expect(formatCurrentDate('wareki_short', undefined, FIXED)).toBe('R8.04.10')
  })

  it('formats with day of week', () => {
    expect(formatCurrentDate('yyyy年MM月dd日 (ddd)', undefined, FIXED)).toBe('2026年04月10日 (金)')
  })

  it('formats custom', () => {
    expect(formatCurrentDate('custom', 'yyyy-MM-dd (ddd)', FIXED)).toBe('2026-04-10 (金)')
  })

  it('handles wareki for Heisei era', () => {
    const heisei = new Date(2018, 0, 1)
    expect(formatCurrentDate('wareki_full', undefined, heisei)).toBe('平成30年01月01日')
  })

  it('handles wareki for Showa era', () => {
    const showa = new Date(1985, 5, 15)
    expect(formatCurrentDate('wareki_short', undefined, showa)).toBe('S60.06.15')
  })
})
