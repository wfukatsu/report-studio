import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { historyTimerRef, clearHistoryTimer } from './historyTimer'

beforeEach(() => {
  vi.useFakeTimers()
  historyTimerRef.current = null
})

afterEach(() => {
  vi.useRealTimers()
})

// jsdom types setTimeout as returning number; the ref is typed against the
// ambient ReturnType<typeof setTimeout>, so normalize through a tiny helper.
const schedule = (fn: () => void) =>
  setTimeout(fn, 300) as unknown as ReturnType<typeof setTimeout>

describe('historyTimer', () => {
  it('clearHistoryTimer cancels a pending timer and nulls the ref', () => {
    const spy = vi.fn()
    historyTimerRef.current = schedule(spy)

    clearHistoryTimer()
    vi.advanceTimersByTime(1000)

    expect(spy).not.toHaveBeenCalled()
    expect(historyTimerRef.current).toBeNull()
  })

  it('clearHistoryTimer is a no-op when no timer is pending', () => {
    expect(historyTimerRef.current).toBeNull()
    expect(() => clearHistoryTimer()).not.toThrow()
    expect(historyTimerRef.current).toBeNull()
  })

  it('an uncancelled timer still fires (ref is a plain passthrough)', () => {
    const spy = vi.fn()
    historyTimerRef.current = schedule(spy)

    vi.advanceTimersByTime(300)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('clearing after replacement only cancels the latest timer', () => {
    const first = vi.fn()
    const second = vi.fn()
    // Simulates the debounce pattern used by layoutSlice/clipboardSlice:
    // schedule → clear → reschedule.
    historyTimerRef.current = schedule(first)
    clearHistoryTimer()
    historyTimerRef.current = schedule(second)

    clearHistoryTimer()
    vi.advanceTimersByTime(1000)

    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })
})
