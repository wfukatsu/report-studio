import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReportStore } from '@/store'
import { useResolvedData, resolveCurrentData } from './useResolvedData'
import type { SchemaGroup } from '@/types'

const CUSTOMER_GROUP = {
  id: 'grp_1',
  label: '顧客',
  role: 'master',
  dataKey: 'customer',
  fields: [{ id: 'f1', key: 'name', label: '氏名', type: 'string' }],
} as unknown as SchemaGroup

function setSchemaGroups(groups: SchemaGroup[]) {
  const definition = useReportStore.getState().definition
  useReportStore.setState({
    definition: { ...definition, schema: { ...definition.schema, groups } },
  })
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ livePreviewData: null, testData: {} })
})

describe('useResolvedData — priority chain', () => {
  it('returns the external override when provided (highest priority)', () => {
    const override = { customer: { name: '外部' } }
    useReportStore.getState().setLivePreviewData({ grp_1: { name: 'ライブ' } })
    setSchemaGroups([CUSTOMER_GROUP])

    const { result } = renderHook(() => useResolvedData(override))
    expect(result.current).toBe(override)
  })

  it('flattens livePreviewData through the schema (groupId → dataKey)', () => {
    setSchemaGroups([CUSTOMER_GROUP])
    useReportStore.getState().setLivePreviewData({ grp_1: { name: '山田' } })

    const { result } = renderHook(() => useResolvedData())
    expect(result.current).toEqual({ customer: { name: '山田' } })
  })

  it('keeps detail-group rows as arrays under their dataKey', () => {
    const items = { ...CUSTOMER_GROUP, id: 'grp_2', role: 'detail', dataKey: 'items' } as unknown as SchemaGroup
    setSchemaGroups([items])
    useReportStore.getState().setLivePreviewData({ grp_2: [{ product: 'A' }, { product: 'B' }] })

    const { result } = renderHook(() => useResolvedData())
    expect(result.current).toEqual({ items: [{ product: 'A' }, { product: 'B' }] })
  })

  it('falls back to an empty object without override / live data / samples', () => {
    const { result } = renderHook(() => useResolvedData())
    expect(result.current).toEqual({})
  })
})

describe('resolveCurrentData — non-hook variant', () => {
  it('prefers livePreviewData (flattened) over testData', () => {
    setSchemaGroups([CUSTOMER_GROUP])
    useReportStore.setState({ testData: { customer: { name: 'テスト' } } })
    useReportStore.getState().setLivePreviewData({ grp_1: { name: 'ライブ' } })

    expect(resolveCurrentData()).toEqual({ customer: { name: 'ライブ' } })
  })

  it('returns testData when no live data is present', () => {
    useReportStore.setState({ testData: { customer: { name: 'テスト' } } })
    expect(resolveCurrentData()).toEqual({ customer: { name: 'テスト' } })
  })
})
