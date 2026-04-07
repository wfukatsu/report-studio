import { describe, it, expect } from 'vitest'
import { parseFieldValue, parseDataSourceJSON, mergePreviewData } from './dataSourceUtils'

describe('parseFieldValue', () => {
  it('parses JSON number', () => {
    const result = parseFieldValue('42')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(42)
  })

  it('parses JSON boolean', () => {
    const result = parseFieldValue('true')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(true)
  })

  it('parses JSON object', () => {
    const result = parseFieldValue('{"name":"Alice"}')
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.value as Record<string, string>).name).toBe('Alice')
  })

  it('parses JSON array', () => {
    const result = parseFieldValue('[1,2,3]')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([1, 2, 3])
  })

  it('falls back to plain string for non-JSON', () => {
    const result = parseFieldValue('hello world')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('hello world')
  })

  it('falls back to raw string when JSON is invalid', () => {
    const result = parseFieldValue('{invalid')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('{invalid')
  })
})

describe('parseDataSourceJSON', () => {
  it('returns ok with fields for valid object', () => {
    const result = parseDataSourceJSON('{"name":"Alice","age":30}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fields.name).toBe('Alice')
      expect(result.fields.age).toBe(30)
    }
  })

  it('returns error for non-object (array)', () => {
    const result = parseDataSourceJSON('[1,2,3]')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('JSONはオブジェクトである必要があります')
  })

  it('returns error for null', () => {
    const result = parseDataSourceJSON('null')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('JSONはオブジェクトである必要があります')
  })

  it('returns error for invalid JSON', () => {
    const result = parseDataSourceJSON('{invalid')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('無効なJSON形式です')
  })

  it('returns error for number', () => {
    const result = parseDataSourceJSON('42')
    expect(result.ok).toBe(false)
  })
})

describe('mergePreviewData', () => {
  it('returns empty object for empty array', () => {
    expect(mergePreviewData([])).toEqual({})
  })

  it('returns fields from single datasource', () => {
    const result = mergePreviewData([
      { id: 'ds-1', name: 'DS1', fields: { a: 1, b: 2 } },
    ])
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('merges fields from multiple datasources', () => {
    const result = mergePreviewData([
      { id: 'ds-1', name: 'DS1', fields: { a: 1 } },
      { id: 'ds-2', name: 'DS2', fields: { b: 2 } },
    ])
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('later source fields override earlier', () => {
    const result = mergePreviewData([
      { id: 'ds-1', name: 'DS1', fields: { name: 'Alice' } },
      { id: 'ds-2', name: 'DS2', fields: { name: 'Bob' } },
    ])
    expect(result.name).toBe('Bob')
  })
})
