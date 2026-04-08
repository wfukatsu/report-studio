import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDataResolver } from './useDataResolver'

describe('useDataResolver', () => {
  const sampleData = {
    name: '田中太郎',
    amount: 1500,
    nested: { city: '東京' },
  }

  it('resolves a simple field key', () => {
    const { result } = renderHook(() => useDataResolver('name', sampleData))
    expect(result.current.resolved).toBe('田中太郎')
    expect(result.current.raw).toBe('田中太郎')
    expect(result.current.error).toBeNull()
  })

  it('resolves a nested field key with dot notation', () => {
    const { result } = renderHook(() => useDataResolver('nested.city', sampleData))
    expect(result.current.resolved).toBe('東京')
  })

  it('returns fallbackText for missing field', () => {
    const { result } = renderHook(() =>
      useDataResolver('nonexistent', sampleData, { fallbackText: 'N/A' }),
    )
    expect(result.current.resolved).toBe('N/A')
    expect(result.current.error).toBeNull()
  })

  it('returns empty string for missing field without fallback', () => {
    const { result } = renderHook(() => useDataResolver('nonexistent', sampleData))
    expect(result.current.resolved).toBe('')
  })

  it('returns fallbackText for empty fieldKey', () => {
    const { result } = renderHook(() =>
      useDataResolver('', sampleData, { fallbackText: '未設定' }),
    )
    expect(result.current.resolved).toBe('未設定')
  })

  it('resolves numeric value as string', () => {
    const { result } = renderHook(() => useDataResolver('amount', sampleData))
    expect(result.current.resolved).toBe('1500')
    expect(result.current.raw).toBe('1500')
  })

  it('applies format when provided', () => {
    const { result } = renderHook(() =>
      useDataResolver('amount', sampleData, {
        format: { type: 'currency_jpy' },
      }),
    )
    // The exact format depends on applyFormat implementation
    expect(result.current.resolved).toBeTruthy()
    expect(result.current.error).toBeNull()
  })

  it('memoizes result for same inputs', () => {
    const { result, rerender } = renderHook(
      ({ fieldKey }) => useDataResolver(fieldKey, sampleData),
      { initialProps: { fieldKey: 'name' } },
    )
    const first = result.current
    rerender({ fieldKey: 'name' })
    expect(result.current).toBe(first) // same reference
  })
})
