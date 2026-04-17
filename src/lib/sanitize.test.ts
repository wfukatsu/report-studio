import { describe, it, expect } from 'vitest'
import { sanitizeJSON } from './sanitize'

describe('sanitizeJSON', () => {
  it('passes through primitive values unchanged', () => {
    expect(sanitizeJSON('hello')).toBe('hello')
    expect(sanitizeJSON(42)).toBe(42)
    expect(sanitizeJSON(null)).toBeNull()
    expect(sanitizeJSON(true)).toBe(true)
  })

  it('passes through clean objects unchanged', () => {
    const obj = { name: 'test', value: 123 }
    expect(sanitizeJSON(obj)).toEqual(obj)
  })

  it('strips __proto__ keys', () => {
    const malicious = JSON.parse('{"name":"ok","__proto__":{"isAdmin":true}}')
    const cleaned = sanitizeJSON(malicious) as Record<string, unknown>
    expect(cleaned.name).toBe('ok')
    expect(cleaned).not.toHaveProperty('__proto__')
  })

  it('strips constructor keys', () => {
    const malicious = { name: 'ok', constructor: { prototype: { pwned: true } } }
    const cleaned = sanitizeJSON(malicious) as Record<string, unknown>
    expect(cleaned.name).toBe('ok')
    expect(cleaned).not.toHaveProperty('constructor')
  })

  it('strips prototype keys', () => {
    const malicious = { name: 'ok', prototype: { evil: true } }
    const cleaned = sanitizeJSON(malicious) as Record<string, unknown>
    expect(cleaned).not.toHaveProperty('prototype')
  })

  it('strips dangerous keys recursively in nested objects', () => {
    const nested = JSON.parse('{"data":{"__proto__":{"admin":true},"safe":"value"}}')
    const cleaned = sanitizeJSON(nested) as { data: Record<string, unknown> }
    expect(cleaned.data.safe).toBe('value')
    expect(cleaned.data).not.toHaveProperty('__proto__')
  })

  it('handles arrays correctly', () => {
    const arr = [{ name: 'a' }, { name: 'b', __proto__: { x: 1 } }]
    const cleaned = sanitizeJSON(JSON.parse(JSON.stringify(arr))) as unknown[]
    expect(cleaned).toHaveLength(2)
  })

  it('throws on deeply nested objects exceeding MAX_DEPTH', () => {
    let obj: Record<string, unknown> = { value: 'leaf' }
    for (let i = 0; i < 55; i++) {
      obj = { nested: obj }
    }
    expect(() => sanitizeJSON(obj)).toThrow('JSON構造が深すぎます')
  })

  it('throws when object count exceeds MAX_OBJECT_COUNT', () => {
    const bigArray = Array.from({ length: 5001 }, (_, i) => ({ id: i }))
    expect(() => sanitizeJSON(bigArray)).toThrow('JSONオブジェクト数が上限を超えています')
  })
})
