import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useBrandColors,
  useRecentColors,
  DEFAULT_BRAND_COLORS,
  _resetColorPrefsCache,
} from './useColorPrefs'

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}

beforeEach(() => {
  localStorageMock.clear()
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
  // Reset module-level cache after each mock setup
  _resetColorPrefsCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// useBrandColors
// ---------------------------------------------------------------------------

describe('useBrandColors — 初期状態', () => {
  it('localStorage が空のときデフォルト色を返す', () => {
    const { result } = renderHook(() => useBrandColors())
    expect(result.current.colors).toEqual(DEFAULT_BRAND_COLORS)
  })

  it('保存済みデータを読み込む', () => {
    const saved = [{ hex: '#123456', name: 'テスト' }]
    localStorageMock.setItem('rds2:brandColors', JSON.stringify(saved))
    _resetColorPrefsCache()
    const { result } = renderHook(() => useBrandColors())
    expect(result.current.colors).toEqual(saved)
  })

  it('不正 JSON のときデフォルト色にフォールバック', () => {
    localStorageMock.setItem('rds2:brandColors', 'INVALID{{{')
    const { result } = renderHook(() => useBrandColors())
    expect(result.current.colors).toEqual(DEFAULT_BRAND_COLORS)
  })
})

describe('useBrandColors — add', () => {
  it('新しい色を追加する', () => {
    const { result } = renderHook(() => useBrandColors())
    act(() => { result.current.add({ hex: '#ABCDEF', name: '追加色' }) })
    expect(result.current.colors.some((c) => c.hex === '#ABCDEF')).toBe(true)
  })

  it('同じ HEX は追加されない（大文字小文字を無視）', () => {
    const { result } = renderHook(() => useBrandColors())
    const initialLen = result.current.colors.length
    act(() => { result.current.add({ hex: DEFAULT_BRAND_COLORS[0].hex, name: '重複' }) })
    expect(result.current.colors.length).toBe(initialLen)
  })

  it('12 件上限で追加不可、isFull = true', () => {
    // 事前に 12 件埋める
    const twelveColors = Array.from({ length: 12 }, (_, i) => ({
      hex: `#${String(i).padStart(6, '0')}`,
      name: `色${i}`,
    }))
    localStorageMock.setItem('rds2:brandColors', JSON.stringify(twelveColors))
    _resetColorPrefsCache()
    const { result } = renderHook(() => useBrandColors())
    expect(result.current.isFull).toBe(true)
    act(() => { result.current.add({ hex: '#FFFFFF', name: '超過' }) })
    expect(result.current.colors.length).toBe(12)
  })
})

describe('useBrandColors — remove', () => {
  it('HEX で色を削除する', () => {
    const { result } = renderHook(() => useBrandColors())
    const firstHex = result.current.colors[0].hex
    act(() => { result.current.remove(firstHex) })
    expect(result.current.colors.some((c) => c.hex === firstHex)).toBe(false)
  })
})

describe('useBrandColors — update', () => {
  it('名前を更新する', () => {
    const { result } = renderHook(() => useBrandColors())
    const firstHex = result.current.colors[0].hex
    act(() => { result.current.update(firstHex, { name: '新しい名前' }) })
    const updated = result.current.colors.find((c) => c.hex === firstHex)
    expect(updated?.name).toBe('新しい名前')
  })
})

// ---------------------------------------------------------------------------
// useRecentColors
// ---------------------------------------------------------------------------

describe('useRecentColors — 初期状態', () => {
  it('localStorage が空のとき空配列を返す', () => {
    const { result } = renderHook(() => useRecentColors())
    expect(result.current.colors).toEqual([])
  })
})

describe('useRecentColors — push', () => {
  it('色を先頭に追加する', () => {
    const { result } = renderHook(() => useRecentColors())
    act(() => { result.current.push('#ff0000') })
    expect(result.current.colors[0]).toBe('#ff0000')
  })

  it('既存色を先頭に移動する（MRU）', () => {
    const { result } = renderHook(() => useRecentColors())
    act(() => {
      result.current.push('#aaaaaa')
      result.current.push('#bbbbbb')
      result.current.push('#aaaaaa') // 再度追加 → 先頭へ移動
    })
    expect(result.current.colors[0]).toBe('#aaaaaa')
    expect(result.current.colors.filter((c) => c === '#aaaaaa').length).toBe(1)
  })

  it('8 件上限で古いものが削除される', () => {
    const { result } = renderHook(() => useRecentColors())
    act(() => {
      for (let i = 0; i < 9; i++) {
        result.current.push(`#${String(i).padStart(6, '0')}`)
      }
    })
    expect(result.current.colors.length).toBe(8)
  })

  it('大文字小文字を正規化して重複排除する', () => {
    const { result } = renderHook(() => useRecentColors())
    act(() => {
      result.current.push('#AABBCC')
      result.current.push('#aabbcc')
    })
    expect(result.current.colors.filter((c) => c === '#aabbcc').length).toBe(1)
  })
})
