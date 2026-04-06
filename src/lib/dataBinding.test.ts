import { describe, it, expect } from 'vitest'
import { resolveField, interpolate } from './dataBinding'

describe('resolveField', () => {
  it('resolves top-level key', () => {
    expect(resolveField({ name: 'Alice' }, 'name')).toBe('Alice')
  })

  it('resolves nested key with dot notation', () => {
    expect(resolveField({ customer: { name: 'Bob' } }, 'customer.name')).toBe('Bob')
  })

  it('returns empty string for missing key', () => {
    expect(resolveField({}, 'missing')).toBe('')
  })

  it('returns empty string for null intermediate', () => {
    expect(resolveField({ a: null }, 'a.b')).toBe('')
  })

  it('converts numbers to string', () => {
    expect(resolveField({ count: 42 }, 'count')).toBe('42')
  })
})

describe('interpolate', () => {
  it('replaces single token', () => {
    expect(interpolate('Hello {{name}}', { name: 'Alice' })).toBe('Hello Alice')
  })

  it('replaces multiple tokens', () => {
    expect(
      interpolate('{{first}} {{last}}', { first: 'John', last: 'Doe' }),
    ).toBe('John Doe')
  })

  it('leaves unmatched tokens empty', () => {
    expect(interpolate('Hello {{missing}}', {})).toBe('Hello ')
  })

  it('handles whitespace around field key', () => {
    expect(interpolate('{{ name }}', { name: 'Alice' })).toBe('Alice')
  })

  it('passes through text without tokens', () => {
    expect(interpolate('No tokens here', {})).toBe('No tokens here')
  })
})

describe('system variables', () => {
  it('resolves $page', () => {
    expect(interpolate('{{$page}}ページ', {}, { pageIndex: 0, totalPages: 3 })).toBe('1ページ')
  })

  it('resolves $totalPages', () => {
    expect(interpolate('{{$page}}/{{$totalPages}}', {}, { pageIndex: 1, totalPages: 3 })).toBe('2/3')
  })

  it('resolves $printDate', () => {
    const result = interpolate('{{$printDate}}', {}, { pageIndex: 0, totalPages: 1 })
    expect(result).toMatch(/\d{4}年\d{1,2}月\d{1,2}日/)
  })

  it('ignores $vars when no pageContext', () => {
    expect(interpolate('{{$page}}', {})).toBe('{{$page}}')
  })

  it('mixes system vars with data fields', () => {
    const result = interpolate(
      '{{name}} - {{$page}}/{{$totalPages}}',
      { name: 'Report' },
      { pageIndex: 2, totalPages: 5 },
    )
    expect(result).toBe('Report - 3/5')
  })
})
