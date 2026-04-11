import { describe, it, expect } from 'vitest'
import { groupRecords, applyGroupedMaxItems, countGroupedRows } from './grouping'

describe('groupRecords', () => {
  it('データ出現順でグルーピングされること', () => {
    const records = [
      { system: 'dev', name: 'A' },
      { system: 'prod', name: 'B' },
      { system: 'dev', name: 'C' },
      { system: 'staging', name: 'D' },
      { system: 'prod', name: 'E' },
    ]
    const result = groupRecords(records, 'system')

    expect(result).toHaveLength(3)
    expect(result[0].groupValue).toBe('dev')
    expect(result[0].records).toHaveLength(2)
    expect(result[1].groupValue).toBe('prod')
    expect(result[1].records).toHaveLength(2)
    expect(result[2].groupValue).toBe('staging')
    expect(result[2].records).toHaveLength(1)
  })

  it('空配列で空配列が返ること', () => {
    expect(groupRecords([], 'system')).toEqual([])
  })

  it('null/undefined値レコードが「(未分類)」グループに入ること', () => {
    const records = [
      { system: 'dev', name: 'A' },
      { name: 'B' },                    // system undefined
      { system: '', name: 'C' },         // system empty
      { system: 'dev', name: 'D' },
    ]
    const result = groupRecords(records, 'system')

    expect(result).toHaveLength(2)
    expect(result[0].groupValue).toBe('dev')
    expect(result[0].records).toHaveLength(2)
    expect(result[1].groupValue).toBe('(未分類)')
    expect(result[1].records).toHaveLength(2)
  })

  it('全レコードが同じグループ値の場合、1グループになること', () => {
    const records = [
      { system: 'prod', name: 'A' },
      { system: 'prod', name: 'B' },
    ]
    const result = groupRecords(records, 'system')
    expect(result).toHaveLength(1)
    expect(result[0].records).toHaveLength(2)
  })

  it('groupKeyフィールドが正しく設定されること', () => {
    const records = [{ system: 'dev', name: 'A' }]
    const result = groupRecords(records, 'system')
    expect(result[0].groupKey).toBe('system')
  })
})

describe('applyGroupedMaxItems', () => {
  const groups = [
    { groupKey: 'sys', groupValue: 'dev', records: [{ a: 1 }, { a: 2 }] },
    { groupKey: 'sys', groupValue: 'staging', records: [{ a: 3 }] },
    { groupKey: 'sys', groupValue: 'prod', records: [{ a: 4 }, { a: 5 }, { a: 6 }] },
  ]

  it('maxItems=0で全グループ返却されること', () => {
    const result = applyGroupedMaxItems(groups, 0, false)
    expect(result).toHaveLength(3)
    expect(result[0].records).toHaveLength(2)
    expect(result[1].records).toHaveLength(1)
    expect(result[2].records).toHaveLength(3)
  })

  it('maxItems制限が正しく適用されること（小計なし）', () => {
    // dev: 1+2=3, staging: 1+1=2 → consumed=5, remaining=1 < minGroupRows(2) → 2グループのみ
    const result = applyGroupedMaxItems(groups, 6, false)
    expect(result).toHaveLength(2)
    expect(result[0].groupValue).toBe('dev')
    expect(result[1].groupValue).toBe('staging')
  })

  it('行数超過時にグループが切り捨てられること', () => {
    // maxItems=4, 小計なし: dev(1+2=3), staging: remaining=1 < min(2) → 1グループのみ
    const result = applyGroupedMaxItems(groups, 4, false)
    expect(result).toHaveLength(1)
    expect(result[0].groupValue).toBe('dev')
    expect(result[0].records).toHaveLength(2)
  })

  it('小計行ありの場合、小計行分も消費されること', () => {
    // maxItems=10, 小計あり
    // dev: 1+2+1=4, staging: 1+1+1=3, prod: remaining=3, min=3 → 1+1+1=3 OK (データ1行に制限)
    const result = applyGroupedMaxItems(groups, 10, true)
    expect(result).toHaveLength(3)
    expect(result[0].records).toHaveLength(2)
    expect(result[1].records).toHaveLength(1)
    expect(result[2].records).toHaveLength(1) // 3レコード中1つだけ収まる
  })

  it('グループ内データ行が制限される場合', () => {
    // maxItems=5, 小計なし: dev(1+2=3), staging: remaining=2 → 1+1=2 OK
    const result = applyGroupedMaxItems(groups, 5, false)
    expect(result).toHaveLength(2)
    expect(result[0].records).toHaveLength(2)
    expect(result[1].records).toHaveLength(1)
  })
})

describe('countGroupedRows', () => {
  const groups = [
    { groupKey: 'sys', groupValue: 'dev', records: [{ a: 1 }, { a: 2 }] },
    { groupKey: 'sys', groupValue: 'prod', records: [{ a: 3 }] },
  ]

  it('小計なしの行数計算', () => {
    // dev: 1+2=3, prod: 1+1=2 → total=5
    expect(countGroupedRows(groups, false)).toBe(5)
  })

  it('小計ありの行数計算', () => {
    // dev: 1+2+1=4, prod: 1+1+1=3 → total=7
    expect(countGroupedRows(groups, true)).toBe(7)
  })

  it('空グループ配列', () => {
    expect(countGroupedRows([], false)).toBe(0)
  })
})
