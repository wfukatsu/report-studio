import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePreviewData } from './usePreviewData'
import { useReportStore } from '@/store'
import type { DataSourceDefinition } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('usePreviewData', () => {
  it('データソースがないとき空オブジェクトを返す', () => {
    const { result } = renderHook(() => usePreviewData())
    expect(result.current).toEqual({})
  })

  it('データソースのフィールドをマージして返す', () => {
    const ds: DataSourceDefinition = {
      id: 'ds1',
      name: 'Test',
      fields: { name: '田中', age: 30 },
    }
    useReportStore.getState().setDataSource(ds)
    const { result } = renderHook(() => usePreviewData())
    expect(result.current).toMatchObject({ name: '田中', age: 30 })
  })
})
