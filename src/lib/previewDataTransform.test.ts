import { describe, it, expect, vi } from 'vitest'
import { buildFlatDataFromResolved } from './previewDataTransform'
import type { SchemaDefinition } from '@/types'

function makeSchema(groups: Array<{ id: string; dataKey: string }>): SchemaDefinition {
  return {
    groups: groups.map((g) => ({
      id: g.id,
      label: g.id,
      role: 'master' as const,
      dataKey: g.dataKey,
      fields: [],
    })),
  }
}

describe('buildFlatDataFromResolved', () => {
  it('groupId → dataKey にマップしてネスト構造を返す', () => {
    const schema = makeSchema([{ id: 'grp_1', dataKey: 'customer' }])
    const resolved = { grp_1: { name: '山田太郎', amount: 12000 } }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({ customer: { name: '山田太郎', amount: 12000 } })
  })

  it('複数グループを同時に変換できる', () => {
    const schema = makeSchema([
      { id: 'grp_1', dataKey: 'customer' },
      { id: 'grp_2', dataKey: 'order' },
    ])
    const resolved = {
      grp_1: { name: '山田' },
      grp_2: { total: 5000 },
    }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({ customer: { name: '山田' }, order: { total: 5000 } })
  })

  it('schema が undefined のとき空オブジェクトを返す', () => {
    const result = buildFlatDataFromResolved({ grp_1: { x: 1 } }, undefined)
    expect(result).toEqual({})
  })

  it('schema にない groupId は console.warn してスキップ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = makeSchema([{ id: 'grp_1', dataKey: 'customer' }])
    const resolved = { grp_1: { name: '山田' }, unknown_grp: { x: 1 } }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({ customer: { name: '山田' } })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown_grp'))
    warn.mockRestore()
  })

  it('dataKey が空のグループは console.warn してスキップ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const schema = makeSchema([{ id: 'grp_1', dataKey: '' }])
    const resolved = { grp_1: { name: '山田' } }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({})
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('empty dataKey'))
    warn.mockRestore()
  })

  it('null 値を含むフィールドを正しく扱う', () => {
    const schema = makeSchema([{ id: 'grp_1', dataKey: 'item' }])
    const resolved = { grp_1: { name: null, value: 0 } }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({ item: { name: null, value: 0 } })
  })
})
