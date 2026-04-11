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

  // ---------------------------------------------------------------------------
  // Phase 2.5: detail group (array) support
  // ---------------------------------------------------------------------------

  it('detail グループ（配列）を dataKey にそのままマップする', () => {
    const schema = {
      groups: [
        { id: 'grp_items', label: 'items', role: 'detail' as const, dataKey: 'items', fields: [] },
      ],
    }
    const rows = [
      { product: 'A', qty: 3 },
      { product: 'B', qty: 1 },
    ]
    const resolved = { grp_items: rows }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({ items: rows })
    expect(Array.isArray(result.items)).toBe(true)
    expect((result.items as typeof rows).length).toBe(2)
  })

  it('master と detail の混在グループを同時に変換できる', () => {
    const schema = {
      groups: [
        { id: 'grp_master', label: 'master', role: 'master' as const, dataKey: 'customer', fields: [] },
        { id: 'grp_detail', label: 'detail', role: 'detail' as const, dataKey: 'items', fields: [] },
      ],
    }
    const resolved = {
      grp_master: { name: '山田' },
      grp_detail: [{ product: 'A', qty: 3 }],
    }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({
      customer: { name: '山田' },
      items: [{ product: 'A', qty: 3 }],
    })
  })

  it('detail グループの空配列は空配列として格納される', () => {
    const schema = {
      groups: [
        { id: 'grp_items', label: 'items', role: 'detail' as const, dataKey: 'items', fields: [] },
      ],
    }
    const resolved = { grp_items: [] }
    const result = buildFlatDataFromResolved(resolved, schema)
    expect(result).toEqual({ items: [] })
    expect(Array.isArray(result.items)).toBe(true)
  })
})
