import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useDropdownDismiss } from './useDropdownDismiss'

function setupHook(isOpen: boolean, onClose: () => void) {
  const { result } = renderHook(() => {
    const ref = useRef<HTMLDivElement>(document.createElement('div'))
    useDropdownDismiss(ref, isOpen, onClose)
    return ref
  })
  return result.current
}

describe('useDropdownDismiss', () => {
  it('isOpen=false のとき mousedown をリッスンしない', () => {
    const onClose = vi.fn()
    setupHook(false, onClose)

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('isOpen=true かつ外側クリックで onClose を呼ぶ', () => {
    const onClose = vi.fn()
    setupHook(true, onClose)

    // 要素の外をクリック (documentレベル)
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape キーで onClose を呼ぶ', () => {
    const onClose = vi.fn()
    setupHook(true, onClose)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape 以外のキーでは onClose を呼ばない', () => {
    const onClose = vi.fn()
    setupHook(true, onClose)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
