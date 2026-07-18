import { describe, it, expect } from 'vitest'
import { keyTypeLabel, groupRoleLabel } from './scalardbLabels'

describe('scalardbLabels', () => {
  it('translates key types to plain Japanese', () => {
    expect(keyTypeLabel('partition')).toBe('パーティションキー')
    expect(keyTypeLabel('clustering')).toBe('クラスタリングキー')
    expect(keyTypeLabel('index')).toBe('索引')
  })

  it('returns null for a regular (non-key) column', () => {
    expect(keyTypeLabel(undefined)).toBeNull()
    expect(keyTypeLabel(null)).toBeNull()
  })

  it('translates group roles', () => {
    expect(groupRoleLabel('master')).toBe('マスター')
    expect(groupRoleLabel('detail')).toBe('明細')
  })
})
