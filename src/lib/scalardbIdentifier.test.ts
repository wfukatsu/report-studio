import { describe, it, expect } from 'vitest'
import { validateScalarDbIdentifier, SCALARDB_IDENTIFIER_REGEX } from './scalardbIdentifier'

describe('SCALARDB_IDENTIFIER_REGEX', () => {
  it('accepts a valid snake_case identifier', () => {
    expect(SCALARDB_IDENTIFIER_REGEX.test('user_account')).toBe(true)
  })
  it('accepts identifier starting with underscore', () => {
    expect(SCALARDB_IDENTIFIER_REGEX.test('_internal')).toBe(true)
  })
  it('accepts uppercase letters', () => {
    expect(SCALARDB_IDENTIFIER_REGEX.test('UserId')).toBe(true)
  })
  it('rejects identifier starting with a digit', () => {
    expect(SCALARDB_IDENTIFIER_REGEX.test('1invalid')).toBe(false)
  })
  it('rejects hyphen', () => {
    expect(SCALARDB_IDENTIFIER_REGEX.test('my-table')).toBe(false)
  })
  it('rejects Japanese chars', () => {
    expect(SCALARDB_IDENTIFIER_REGEX.test('テーブル')).toBe(false)
  })
})

describe('validateScalarDbIdentifier', () => {
  it('returns valid: true for a valid identifier', () => {
    expect(validateScalarDbIdentifier('orders')).toEqual({ valid: true })
  })
  it('returns valid: false with error for empty string', () => {
    const result = validateScalarDbIdentifier('')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toBeTruthy()
  })
  it('returns valid: false with error for leading digit', () => {
    const result = validateScalarDbIdentifier('9nine')
    expect(result.valid).toBe(false)
  })
  it('returns valid: false with error for hyphen', () => {
    const result = validateScalarDbIdentifier('my-col')
    expect(result.valid).toBe(false)
  })
  it('returns valid: false with error for Japanese chars', () => {
    const result = validateScalarDbIdentifier('名前')
    expect(result.valid).toBe(false)
  })
  it('returns valid: true for exactly MAX_IDENTIFIER_LENGTH chars', () => {
    const exactly64 = 'a'.repeat(64)
    expect(validateScalarDbIdentifier(exactly64)).toEqual({ valid: true })
  })
  it('returns valid: false for identifier exceeding MAX_IDENTIFIER_LENGTH', () => {
    const over64 = 'a'.repeat(65)
    const result = validateScalarDbIdentifier(over64)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('64') // error mentions the max, not the actual length
  })
})
