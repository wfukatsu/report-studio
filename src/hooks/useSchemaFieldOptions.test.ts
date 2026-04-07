import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSchemaFieldOptions } from './useSchemaFieldOptions'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('useSchemaFieldOptions', () => {
  it('スキーマ未定義のとき空配列を返す', () => {
    const { result } = renderHook(() => useSchemaFieldOptions())
    expect(result.current).toEqual([])
  })

  it('master グループのフィールドは key をそのまま value にする', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().updateSchemaGroup(groupId, { dataKey: 'customer' })
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '名前', type: 'string' } as never)

    const { result } = renderHook(() => useSchemaFieldOptions())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].value).toBe('name')
    expect(result.current[0].groupRole).toBe('master')
  })

  it('detail グループのフィールドは dataKey[].key 形式の value になる', () => {
    useReportStore.getState().addSchemaGroup('detail')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().updateSchemaGroup(groupId, { dataKey: 'items' })
    useReportStore.getState().addSchemaField(groupId, { key: 'amount', label: '金額', type: 'number' } as never)

    const { result } = renderHook(() => useSchemaFieldOptions())
    expect(result.current[0].value).toBe('items[].amount')
    expect(result.current[0].groupRole).toBe('detail')
  })

  it('dataKey が空のとき group id をフォールバックに使う', () => {
    useReportStore.getState().addSchemaGroup('detail')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    // dataKey を設定しない (空文字 = falsy)
    useReportStore.getState().addSchemaField(groupId, { key: 'qty', label: '数量', type: 'number' } as never)

    const { result } = renderHook(() => useSchemaFieldOptions())
    expect(result.current[0].value).toBe(`${groupId}[].qty`)
  })

  it('label がフィールドに設定されているとき (label) 形式で表示される', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'email', label: 'メール', type: 'string' } as never)

    const { result } = renderHook(() => useSchemaFieldOptions())
    expect(result.current[0].label).toContain('メール')
  })

  it('複数グループの全フィールドを返す', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().addSchemaGroup('detail')
    const [g1, g2] = useReportStore.getState().definition.schema!.groups
    useReportStore.getState().addSchemaField(g1.id, { key: 'f1', label: '', type: 'string' } as never)
    useReportStore.getState().addSchemaField(g2.id, { key: 'f2', label: '', type: 'string' } as never)
    useReportStore.getState().addSchemaField(g2.id, { key: 'f3', label: '', type: 'number' } as never)

    const { result } = renderHook(() => useSchemaFieldOptions())
    expect(result.current).toHaveLength(3)
  })
})
