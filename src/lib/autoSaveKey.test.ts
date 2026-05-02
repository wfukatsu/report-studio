import { describe, it, expect } from 'vitest'
import { getAutoSaveKey, LEGACY_AUTOSAVE_KEY } from './autoSaveKey'

describe('getAutoSaveKey', () => {
  it('returns null when userId is null', () => {
    expect(getAutoSaveKey(null)).toBeNull()
  })

  it('returns null when userId is undefined', () => {
    expect(getAutoSaveKey(undefined)).toBeNull()
  })

  it('returns null for empty-string userId (treats as logged-out)', () => {
    expect(getAutoSaveKey('')).toBeNull()
  })

  it('returns a keyed value for a real userId', () => {
    expect(getAutoSaveKey('u1')).toBe('rds-autosave:u1')
  })

  it('returns distinct keys for different userIds', () => {
    expect(getAutoSaveKey('alice')).not.toBe(getAutoSaveKey('bob'))
  })

  it('exposes the legacy unkeyed value as a constant for one-shot cleanup', () => {
    expect(LEGACY_AUTOSAVE_KEY).toBe('rds-autosave')
  })
})
