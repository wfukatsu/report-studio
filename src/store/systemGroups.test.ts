import { describe, it, expect } from 'vitest'
import { SYSTEM_GROUP_PRODUCT_MASTER, isSystemGroup } from './systemGroups'

describe('systemGroups', () => {
  it('recognizes the product master system group', () => {
    expect(isSystemGroup(SYSTEM_GROUP_PRODUCT_MASTER)).toBe(true)
    expect(isSystemGroup('__productMaster__')).toBe(true)
  })

  it('rejects ordinary group ids', () => {
    expect(isSystemGroup('customer')).toBe(false)
    expect(isSystemGroup('grp_1')).toBe(false)
    expect(isSystemGroup('')).toBe(false)
  })

  it('rejects other double-underscore ids (allowlist, not pattern match)', () => {
    expect(isSystemGroup('__other__')).toBe(false)
  })

  it('keeps the backend-shared constant stable', () => {
    // Must match the backend constant — changing this breaks stored templates.
    expect(SYSTEM_GROUP_PRODUCT_MASTER).toBe('__productMaster__')
  })
})
