import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShiftKeyTracker } from './useShiftKeyTracker'

describe('useShiftKeyTracker', () => {
  it('ref.current is false initially', () => {
    const { result } = renderHook(() => useShiftKeyTracker())
    expect(result.current.current).toBe(false)
  })

  it('sets ref.current to true on keydown with shiftKey', () => {
    const { result } = renderHook(() => useShiftKeyTracker())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }))
    })
    expect(result.current.current).toBe(true)
  })

  it('keeps ref.current false on keydown without shiftKey', () => {
    const { result } = renderHook(() => useShiftKeyTracker())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: false }))
    })
    expect(result.current.current).toBe(false)
  })

  it('sets ref.current to false on keyup', () => {
    const { result } = renderHook(() => useShiftKeyTracker())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }))
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { shiftKey: false }))
    })
    expect(result.current.current).toBe(false)
  })

  it('sets ref.current to false on window blur', () => {
    const { result } = renderHook(() => useShiftKeyTracker())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }))
    })
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(result.current.current).toBe(false)
  })

  it('removes listeners on unmount without errors', () => {
    const { result, unmount } = renderHook(() => useShiftKeyTracker())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }))
    })
    unmount()
    // Dispatching after unmount should not throw
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }))
    }).not.toThrow()
    // The ref itself still holds the value captured before unmount
    expect(result.current.current).toBe(true)
  })
})
