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

  it('currency_usd', () => {
    const result = formatNumber(1234.5, fmt('currency_usd'))
    expect(result).toContain('$')
    expect(result).toContain('1,234.50')
  })

  it('custom with pattern', () => {
    const result = formatNumber(1234567.89, fmt('custom', { customPattern: '#,##0.00' }))
    expect(result).toContain(',')
  })

  it('custom without pattern falls back to String(value)', () => {
    expect(formatNumber(42, fmt('custom'))).toBe('42')
  })

  it('unknown type falls back to String(value)', () => {
    // @ts-expect-error testing invalid type
    expect(formatNumber(99, fmt('unknown_type'))).toBe('99')
  })
})

// ---------------------------------------------------------------------------
// formatWareki
// ---------------------------------------------------------------------------
describe('formatWareki', () => {
  it('returns Reiwa era for 2026', () => {
    const result = formatWareki(new Date('2026-04-01T00:00:00'), 'wareki_full')
    expect(result).toBe('令和8年4月1日')
  })

  it('returns short format', () => {
    const result = formatWareki(new Date('2026-04-01T00:00:00'), 'wareki_short')
    expect(result).toBe('R08.04.01')
  })

  it('handles Heisei era', () => {
    const result = formatWareki(new Date('2019-04-30T00:00:00'), 'wareki_full')
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

  it('MM/dd/yyyy format', () => {
    const result = formatDate('2026-04-15', { type: 'MM/dd/yyyy' })
    expect(result).toBe('04/15/2026')
  })

  it('wareki_short format', () => {
    const result = formatDate('2026-04-01', { type: 'wareki_short' })
    expect(result).toBe('R08.04.01')
  })

  it('custom format with pattern', () => {
    const result = formatDate('2026-04-15', { type: 'custom', customPattern: 'yyyy-MM-dd' })
    expect(result).toBe('2026-04-15')
  })

  it('custom format without pattern falls back to locale string', () => {
    const result = formatDate('2026-04-15', { type: 'custom' })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('default/unknown type falls back to locale string', () => {
    // @ts-expect-error testing unknown type
    const result = formatDate('2026-04-15', { type: 'unknown_type' })
    expect(typeof result).toBe('string')
  })

  it('accepts Date object directly', () => {
    const date = new Date('2026-04-01T00:00:00')
    const result = formatDate(date, { type: 'yyyy/MM/dd' })
    expect(result).toBe('2026/04/01')
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

  it('returns String(value) for non-numeric, non-date string', () => {
    expect(applyFormat('hello', { type: 'integer' })).toBe('hello')
  })

  it('formats Date object with date format', () => {
    const result = applyFormat(new Date('2026-04-01T00:00:00'), { type: 'yyyy/MM/dd' })
    expect(result).toBe('2026/04/01')
  })

  it('formats number directly with number format', () => {
    expect(applyFormat(1234, { type: 'currency_jpy' })).toContain('¥')
  })
})

// ---------------------------------------------------------------------------
// formatWareki — additional edge cases
// ---------------------------------------------------------------------------
describe('formatWareki — edge cases', () => {
  it('returns 元年 for the first year of an era', () => {
    // Reiwa started 2019-05-01 → year 1 = '元'
    const result = formatWareki(new Date('2019-05-01T00:00:00'), 'wareki_full')
    expect(result).toBe('令和元年5月1日')
  })

  it('returns fallback for pre-Meiji date', () => {
    // Before any known era → toLocaleDateString fallback
    const preEra = new Date('1800-01-01')
    const result = formatWareki(preEra, 'wareki_full')
    expect(typeof result).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// toKanjiNumeral — edge cases
// ---------------------------------------------------------------------------
describe('toKanjiNumeral — edge cases', () => {
  it('handles single digits', () => {
    expect(toKanjiNumeral(5)).toBe('金伍円也')
  })

  it('handles exactly 1 (壱)', () => {
    expect(toKanjiNumeral(1)).toBe('金壱円也')
  })

  it('handles 100 (百)', () => {
    expect(toKanjiNumeral(100)).toBe('金百円也')
  })

  it('handles 11 (壱拾壱)', () => {
    const result = toKanjiNumeral(11)
    expect(result.startsWith('金')).toBe(true)
    expect(result.endsWith('円也')).toBe(true)
  })
})
