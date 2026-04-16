import { describe, it, expect } from 'vitest'
import { formulaToJexl } from '../formulaToJexl'

describe('formulaToJexl', () => {
  it('translates SUM → sum', () => {
    expect(formulaToJexl('SUM(items)')).toBe('sum(items)')
  })

  it('translates COUNT → count', () => {
    expect(formulaToJexl('COUNT(rows)')).toBe('count(rows)')
  })

  it('translates ROUND → round', () => {
    expect(formulaToJexl('ROUND(val, 2)')).toBe('round(val, 2)')
  })

  it('translates AVG → avg', () => {
    expect(formulaToJexl('AVG(scores)')).toBe('avg(scores)')
  })

  it('translates MIN → min', () => {
    expect(formulaToJexl('MIN(scores)')).toBe('min(scores)')
  })

  it('translates MAX → max', () => {
    expect(formulaToJexl('MAX(scores)')).toBe('max(scores)')
  })

  it('translates CONCAT → concat', () => {
    expect(formulaToJexl("CONCAT(a, b)")).toBe("concat(a, b)")
  })

  it('translates IF → ifExpr', () => {
    expect(formulaToJexl("IF(x > 0, 'yes', 'no')")).toBe("ifExpr(x > 0, 'yes', 'no')")
  })

  it('translates TEXT → formatNumber', () => {
    expect(formulaToJexl('TEXT(price)')).toBe('formatNumber(price)')
  })

  it('translates FORMAT_DATE → formatDate', () => {
    expect(formulaToJexl("FORMAT_DATE(d, 'yyyy/MM/dd')")).toBe("formatDate(d, 'yyyy/MM/dd')")
  })

  it('translates nested function calls', () => {
    expect(formulaToJexl('ROUND(SUM(items), 2)')).toBe('round(sum(items), 2)')
  })

  it('passes through plain arithmetic unchanged', () => {
    expect(formulaToJexl('price * qty + 100')).toBe('price * qty + 100')
  })

  it('passes through field references unchanged', () => {
    expect(formulaToJexl('order.total')).toBe('order.total')
  })

  it('does not translate partial matches', () => {
    // "SUMMARY" contains "SUM" but should not be translated
    expect(formulaToJexl('SUMMARY')).toBe('SUMMARY')
  })
})
