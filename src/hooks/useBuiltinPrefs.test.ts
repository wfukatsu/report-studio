import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuiltinPrefs } from './useBuiltinPrefs'

const STORAGE_KEY = 'rds2:builtin-template-prefs'

beforeEach(() => {
  // Reset both localStorage and the module-level snapshot cache. The cache only
  // refreshes through the subscribed event handlers, so dispatch while a
  // subscriber is mounted.
  localStorage.removeItem(STORAGE_KEY)
  const { unmount } = renderHook(() => useBuiltinPrefs())
  act(() => {
    window.dispatchEvent(new Event('builtin-prefs-change'))
  })
  unmount()
})

describe('useBuiltinPrefs', () => {
  it('starts with no hidden templates and no overrides', () => {
    const { result } = renderHook(() => useBuiltinPrefs())
    expect(result.current.prefs).toEqual({ hidden: [], overrides: {} })
  })

  it('hideTemplate hides, showTemplate un-hides, and prefs persist to localStorage', () => {
    const { result } = renderHook(() => useBuiltinPrefs())

    act(() => result.current.hideTemplate('tpl-a'))
    expect(result.current.isHidden('tpl-a')).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).hidden).toContain('tpl-a')

    act(() => result.current.showTemplate('tpl-a'))
    expect(result.current.isHidden('tpl-a')).toBe(false)
  })

  it('hideTemplate is idempotent (no duplicate entries)', () => {
    const { result } = renderHook(() => useBuiltinPrefs())

    act(() => result.current.hideTemplate('tpl-a'))
    act(() => result.current.hideTemplate('tpl-a'))

    expect(result.current.prefs.hidden.filter((h) => h === 'tpl-a')).toHaveLength(1)
  })

  it('toggleHidden flips the hidden state', () => {
    const { result } = renderHook(() => useBuiltinPrefs())

    act(() => result.current.toggleHidden('tpl-b'))
    expect(result.current.isHidden('tpl-b')).toBe(true)
    act(() => result.current.toggleHidden('tpl-b'))
    expect(result.current.isHidden('tpl-b')).toBe(false)
  })

  it('setOverride merges into an existing override; clearOverride removes it', () => {
    const { result } = renderHook(() => useBuiltinPrefs())

    act(() => result.current.setOverride('tpl-c', { category: '請求' }))
    act(() => result.current.setOverride('tpl-c', { tags: ['月次'] }))
    expect(result.current.getOverride('tpl-c')).toEqual({ category: '請求', tags: ['月次'] })

    act(() => result.current.clearOverride('tpl-c'))
    expect(result.current.getOverride('tpl-c')).toBeUndefined()
  })

  it('survives corrupted localStorage content (falls back to defaults)', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const { result } = renderHook(() => useBuiltinPrefs())
    act(() => {
      window.dispatchEvent(new Event('builtin-prefs-change'))
    })
    expect(result.current.prefs).toEqual({ hidden: [], overrides: {} })
  })
})
