import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReportStore } from '@/store'
import { useConnectionState } from './useConnectionState'

vi.mock('@/api/reportApi', () => ({
  checkHealth: vi.fn(),
}))

import { checkHealth } from '@/api/reportApi'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useReportStore.getState().newReport()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useConnectionState', () => {
  it('probes health on mount and sets backendConnected=true', async () => {
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useConnectionState())

    await act(async () => { await Promise.resolve() })

    expect(checkHealth).toHaveBeenCalledTimes(1)
    expect(useReportStore.getState().backendConnected).toBe(true)
  })

  it('sets backendConnected=false when health probe fails', async () => {
    vi.mocked(checkHealth).mockResolvedValue(false)

    renderHook(() => useConnectionState())

    await act(async () => { await Promise.resolve() })

    expect(useReportStore.getState().backendConnected).toBe(false)
  })

  it('sets backendConnected=false immediately on offline event', async () => {
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useConnectionState())
    await act(async () => { await Promise.resolve() })
    expect(useReportStore.getState().backendConnected).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(useReportStore.getState().backendConnected).toBe(false)
  })

  it('re-probes on online event', async () => {
    vi.mocked(checkHealth).mockResolvedValue(false)

    renderHook(() => useConnectionState())
    await act(async () => { await Promise.resolve() })

    vi.mocked(checkHealth).mockResolvedValue(true)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    await act(async () => { await Promise.resolve() })

    expect(useReportStore.getState().backendConnected).toBe(true)
  })

  it('probes periodically every 30 seconds', async () => {
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useConnectionState())
    await act(async () => { await Promise.resolve() })
    const initialCallCount = vi.mocked(checkHealth).mock.calls.length

    await act(async () => {
      vi.advanceTimersByTime(30_000)
      await Promise.resolve()
    })

    expect(vi.mocked(checkHealth).mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  it('removes event listeners on unmount', () => {
    vi.mocked(checkHealth).mockResolvedValue(true)
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useConnectionState())
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})
