import { describe, it, expect } from 'vitest'
import { formatPageNumber } from './format'

describe('formatPageNumber', () => {
  it('formats page only', () => {
    expect(formatPageNumber('{{page}}', undefined, 2, 5)).toBe('2')
  })

  it('formats page / pages with spaces', () => {
    expect(formatPageNumber('{{page}} / {{pages}}', undefined, 1, 3)).toBe('1 / 3')
  })

  it('formats page/pages without spaces', () => {
    expect(formatPageNumber('{{page}}/{{pages}}', undefined, 2, 10)).toBe('2/10')
  })

  it('formats English style', () => {
    expect(formatPageNumber('Page {{page}} of {{pages}}', undefined, 3, 5)).toBe('Page 3 of 5')
  })

  it('formats Japanese style', () => {
    expect(formatPageNumber('{{page}}ページ', undefined, 1, 1)).toBe('1ページ')
  })

  it('uses custom format', () => {
    expect(formatPageNumber('custom', '第{{page}}頁（全{{pages}}頁）', 2, 4)).toBe('第2頁（全4頁）')
  })

  it('falls back to {{page}} when custom format is undefined', () => {
    expect(formatPageNumber('custom', undefined, 3, 5)).toBe('3')
  })
})
