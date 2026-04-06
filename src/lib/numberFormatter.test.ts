import { describe, it, expect } from 'vitest'
import { formatNumber, formatDate, formatWareki, toKanjiNumeral, applyFormat } from './numberFormatter'
import type { CalculationFormat } from '@/types'

// ---------------------------------------------------------------------------
// toKanjiNumeral
// ---------------------------------------------------------------------------
describe('toKanjiNumeral', () => {
  it('converts zero', () => {
    expect(toKanjiNumeral(0)).toBe('金零円也')
  })

  it('converts a simple amount', () => {
    expect(toKanjiNumeral(1000)).toBe('金千円也')
  })

  it('converts 10,000', () => {
    expect(toKanjiNumeral(10000)).toBe('金壱万円也')
  })

  it('converts 1,000,000', () => {
    expect(toKanjiNumeral(1000000)).toBe('金百万円也')
  })

  it('converts a complex amount', () => {
    // 1,234,567 → 百弐拾参万四千伍百六拾七
    const result = toKanjiNumeral(1234567)
    expect(result).toContain('円也')
    expect(result.startsWith('金')).toBe(true)
  })

  it('returns string for non-finite', () => {
    expect(toKanjiNumeral(Infinity)).toBe('Infinity')
    expect(toKanjiNumeral(-1)).toBe('-1')
  })
})

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------
describe('formatNumber', () => {
  const fmt = (type: CalculationFormat['type'], extra?: Partial<CalculationFormat>): CalculationFormat =>
    ({ type, ...extra } as CalculationFormat)

  it('integer', () => {
    expect(formatNumber(1234.9, fmt('integer'))).toBe('1235')
  })

  it('decimal with 2 places', () => {
    expect(formatNumber(1234.5678, fmt('decimal', { decimalPlaces: 2 }))).toBe('1234.57')
  })

  it('currency_jpy', () => {
    expect(formatNumber(1234, fmt('currency_jpy'))).toContain('¥')
  })

  it('percent', () => {
    expect(formatNumber(0.1234, fmt('percent', { decimalPlaces: 1 }))).toBe('12.3%')
  })

  it('comma', () => {
    expect(formatNumber(1234567, fmt('comma'))).toContain(',')
  })

  it('kanji_numeral', () => {
    expect(formatNumber(1000, fmt('kanji_numeral'))).toBe('金千円也')
  })
})

// ---------------------------------------------------------------------------
// formatWareki
// ---------------------------------------------------------------------------
describe('formatWareki', () => {
  it('returns Reiwa era for 2026', () => {
    const result = formatWareki(new Date('2026-04-01'), 'wareki_full')
    expect(result).toBe('令和8年4月1日')
  })

  it('returns short format', () => {
    const result = formatWareki(new Date('2026-04-01'), 'wareki_short')
    expect(result).toBe('R08.04.01')
  })

  it('handles Heisei era', () => {
    const result = formatWareki(new Date('2019-04-30'), 'wareki_full')
    expect(result).toBe('平成31年4月30日')
  })
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('yyyy/MM/dd format', () => {
    const result = formatDate('2026-04-01', { type: 'yyyy/MM/dd' })
    expect(result).toBe('2026/04/01')
  })

  it('yyyy年MM月dd日 format', () => {
    const result = formatDate('2026-04-01', { type: 'yyyy年MM月dd日' })
    expect(result).toBe('2026年4月1日')
  })

  it('wareki_full', () => {
    const result = formatDate('2026-04-01', { type: 'wareki_full' })
    expect(result).toBe('令和8年4月1日')
  })

  it('returns original string for invalid date', () => {
    const result = formatDate('not-a-date', { type: 'yyyy/MM/dd' })
    expect(result).toBe('not-a-date')
  })
})

// ---------------------------------------------------------------------------
// applyFormat
// ---------------------------------------------------------------------------
describe('applyFormat', () => {
  it('returns empty string for null/undefined', () => {
    expect(applyFormat(null, { type: 'integer' })).toBe('')
    expect(applyFormat(undefined, { type: 'integer' })).toBe('')
  })

  it('formats number with date format type by parsing string', () => {
    const result = applyFormat('2026-04-01', { type: 'wareki_full' })
    expect(result).toBe('令和8年4月1日')
  })

  it('formats numeric string with number format type', () => {
    expect(applyFormat('1000', { type: 'comma' })).toContain(',')
  })
})
