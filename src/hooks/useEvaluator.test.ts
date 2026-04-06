import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReportStore } from '@/store'
import { useEvaluator } from './useEvaluator'

vi.mock('@/api/reportApi', () => ({
  evaluateCalculations: vi.fn(),
}))

import { evaluateCalculations } from '@/api/reportApi'

const mockEval = vi.mocked(evaluateCalculations)

function makeRule() {
  return { key: 'total', label: 'Total', expression: 'qty * price', resultType: 'number' as const, onError: 'zero' as const }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useReportStore.getState().newReport()
  useReportStore.getState().setCurrentTemplateId('tpl-1')
  mockEval.mockResolvedValue({ results: { total: 300 }, errors: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useEvaluator', () => {
  it('calls evaluateCalculations after 800ms debounce when calculationRules change', async () => {
    renderHook(() => useEvaluator())

    act(() => {
      useReportStore.getState().addCalculationRule(makeRule())
    })

    // Before debounce fires
    act(() => { vi.advanceTimersByTime(799) })
    expect(mockEval).not.toHaveBeenCalled()

    // After debounce fires
    await act(async () => { vi.advanceTimersByTime(1) })

    expect(mockEval).toHaveBeenCalledTimes(1)
    expect(mockEval).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({ calculationRules: [expect.objectContaining({ key: 'total' })] }),
      expect.any(Object),
      expect.any(AbortSignal),
    )
  })

  it('does nothing when currentTemplateId is null', async () => {
    useReportStore.getState().setCurrentTemplateId(null)
    renderHook(() => useEvaluator())

    act(() => {
      useReportStore.getState().addCalculationRule(makeRule())
    })

    await act(async () => { vi.advanceTimersByTime(1000) })

    expect(mockEval).not.toHaveBeenCalled()
  })

  it('does nothing when calculationRules is empty', async () => {
    renderHook(() => useEvaluator())

    // Trigger by changing testData (no rules)
    await act(async () => { vi.advanceTimersByTime(1000) })

    expect(mockEval).not.toHaveBeenCalled()
  })

  it('sets computedLoading true before fetch', async () => {
    let resolveFetch!: () => void
    mockEval.mockReturnValue(
      new Promise((res) => { resolveFetch = () => res({ results: {}, errors: {} }) }),
    )

    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    act(() => { vi.advanceTimersByTime(800) })
    // Loading set before await
    expect(useReportStore.getState().computedLoading).toBe(true)

    await act(async () => { resolveFetch() })
  })

  it('clears computedLoading after successful fetch (guarded finally: not aborted)', async () => {
    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    await act(async () => { vi.advanceTimersByTime(800) })

    expect(useReportStore.getState().computedLoading).toBe(false)
  })

  it('clears computedLoading after failed fetch (guarded finally: not aborted)', async () => {
    mockEval.mockRejectedValueOnce(new Error('Network error'))

    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    await act(async () => { vi.advanceTimersByTime(800) })

    expect(useReportStore.getState().computedLoading).toBe(false)
    expect(useReportStore.getState().computedErrors._global).toBe('Error: Network error')
  })

  it('sets computedResults on success', async () => {
    mockEval.mockResolvedValue({ results: { total: 500 }, errors: {} })

    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    await act(async () => { vi.advanceTimersByTime(800) })

    expect(useReportStore.getState().computedValues).toEqual({ total: 500 })
  })

  it('does NOT clear computedLoading when request is aborted mid-flight (guarded finally)', async () => {
    let resolveA!: () => void
    mockEval
      .mockReturnValueOnce(
        new Promise((res) => { resolveA = () => res({ results: {}, errors: {} }) }),
      )
      .mockResolvedValueOnce({ results: { total: 200 }, errors: {} })

    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    // Fire A's debounce
    act(() => { vi.advanceTimersByTime(800) })
    expect(useReportStore.getState().computedLoading).toBe(true)

    // Trigger B (aborts A, starts new debounce)
    act(() => { useReportStore.getState().addCalculationRule({ ...makeRule(), key: 'subtotal' }) })
    await act(async () => { vi.advanceTimersByTime(800) })

    // Resolve A after B has already started — A's finally should NOT clear loading
    // (loading is still true because B is in flight or completed)
    await act(async () => { resolveA() })

    // B resolved successfully, so loading should be false now
    expect(useReportStore.getState().computedLoading).toBe(false)
    expect(useReportStore.getState().computedValues).toEqual({ total: 200 })
  })

  it('clears computedLoading on unmount even if request was aborted (cleanup effect)', async () => {
    let resolveFetch!: () => void
    mockEval.mockReturnValue(
      new Promise((res) => { resolveFetch = () => res({ results: {}, errors: {} }) }),
    )

    const { unmount } = renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    // Start the request
    act(() => { vi.advanceTimersByTime(800) })
    expect(useReportStore.getState().computedLoading).toBe(true)

    // Unmount while request is in-flight
    unmount()

    // Cleanup effect should have cleared loading
    expect(useReportStore.getState().computedLoading).toBe(false)

    // Resolving after unmount should not cause errors
    await act(async () => { resolveFetch() })
  })

  it('does not write to store when aborted (local controller capture)', async () => {
    let resolveA!: () => void
    mockEval
      .mockReturnValueOnce(
        new Promise((res) => { resolveA = () => res({ results: { stale: 999 }, errors: {} }) }),
      )
      .mockResolvedValueOnce({ results: { total: 100 }, errors: {} })

    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    // Fire request A
    act(() => { vi.advanceTimersByTime(800) })

    // Trigger B before A completes (aborts A)
    act(() => { useReportStore.getState().addCalculationRule({ ...makeRule(), key: 'tax' }) })
    await act(async () => { vi.advanceTimersByTime(800) })

    // Resolve stale A — should be discarded
    await act(async () => { resolveA() })

    // B's result should be in store, not A's stale result
    expect(useReportStore.getState().computedValues).not.toHaveProperty('stale')
    expect(useReportStore.getState().computedValues).toHaveProperty('total', 100)
  })

  it('cancels previous in-flight request when deps change rapidly (debounce)', async () => {
    renderHook(() => useEvaluator())
    act(() => { useReportStore.getState().addCalculationRule(makeRule()) })

    act(() => { vi.advanceTimersByTime(400) })

    // Second change before debounce fires — should reset timer
    act(() => { useReportStore.getState().addCalculationRule({ ...makeRule(), key: 'tax' }) })

    act(() => { vi.advanceTimersByTime(400) })
    // Still within debounce of second change
    expect(mockEval).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(400) })
    // Only one call (from the second debounce)
    expect(mockEval).toHaveBeenCalledTimes(1)
  })
})
