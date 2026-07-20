import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColorPickerPopover } from './ColorPickerPopover'
import { isValidHex, expandHex } from '@/lib/colorUtils'

// Mock useColorPrefs to avoid localStorage coupling
vi.mock('@/hooks/useColorPrefs', () => ({
  useBrandColors: () => ({
    colors: [
      { hex: '#E74C3C', name: 'メインレッド' },
      { hex: '#2C3E50', name: 'ネイビー' },
    ],
    isFull: false,
  }),
  useRecentColors: () => ({
    colors: ['#aabbcc'],
    push: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// ユーティリティ関数
// ---------------------------------------------------------------------------

describe('isValidHex', () => {
  it('#RRGGBB は valid', () => { expect(isValidHex('#E74C3C')).toBe(true) })
  it('小文字も valid', () => { expect(isValidHex('#e74c3c')).toBe(true) })
  it('#RGB は invalid (expandHex 後に通す)', () => { expect(isValidHex('#E7C')).toBe(false) })
  it('プレフィックスなしは invalid', () => { expect(isValidHex('E74C3C')).toBe(false) })
  it('7 文字未満は invalid', () => { expect(isValidHex('#E74C3')).toBe(false) })
})

describe('expandHex', () => {
  it('#RGB を #RRGGBB に展開する', () => {
    expect(expandHex('#ABC')).toBe('#AABBCC')
  })
  it('#RRGGBB はそのまま', () => {
    expect(expandHex('#AABBCC')).toBe('#AABBCC')
  })
  it('不正な文字列はそのまま返す', () => {
    expect(expandHex('invalid')).toBe('invalid')
  })
})

// ---------------------------------------------------------------------------
// ColorPickerPopover コンポーネント
// ---------------------------------------------------------------------------

describe('ColorPickerPopover', () => {
  let onChange: Mock<(hex: string) => void>
  let onClose: Mock<() => void>

  beforeEach(() => {
    onChange = vi.fn<(hex: string) => void>()
    onClose = vi.fn<() => void>()
  })

  function renderPopover(value = '#FF0000') {
    return render(
      <ColorPickerPopover value={value} onChange={onChange} onClose={onClose} />,
    )
  }

  it('ブランドカラースウォッチが表示される', () => {
    renderPopover()
    expect(screen.getByLabelText('メインレッド (#E74C3C)')).toBeInTheDocument()
    expect(screen.getByLabelText('ネイビー (#2C3E50)')).toBeInTheDocument()
  })

  it('最近使った色セクションが表示される', () => {
    renderPopover()
    expect(screen.getByText('最近使った色')).toBeInTheDocument()
  })

  it('カスタム入力フィールドが表示される', () => {
    renderPopover()
    expect(screen.getByLabelText('カスタムカラー入力')).toBeInTheDocument()
  })

  it('ブランドカラーをクリックすると onChange と onClose が呼ばれる', () => {
    renderPopover()
    fireEvent.click(screen.getByLabelText('メインレッド (#E74C3C)'))
    expect(onChange).toHaveBeenCalledWith('#E74C3C')
    expect(onClose).toHaveBeenCalled()
  })

  it('有効な HEX を入力して ✓ を押すと onChange が呼ばれる', () => {
    renderPopover()
    const input = screen.getByLabelText('カスタムカラー入力')
    fireEvent.change(input, { target: { value: '#123456' } })
    fireEvent.click(screen.getByLabelText('カスタムカラーを適用'))
    expect(onChange).toHaveBeenCalledWith('#123456')
    expect(onClose).toHaveBeenCalled()
  })

  it('不正な HEX では ✓ ボタンが無効', () => {
    renderPopover()
    const input = screen.getByLabelText('カスタムカラー入力')
    fireEvent.change(input, { target: { value: 'invalid' } })
    const btn = screen.getByLabelText('カスタムカラーを適用')
    expect(btn).toBeDisabled()
  })

  it('#RGB を入力して確定すると #RRGGBB に展開される', () => {
    renderPopover()
    const input = screen.getByLabelText('カスタムカラー入力')
    fireEvent.change(input, { target: { value: '#ABC' } })
    fireEvent.click(screen.getByLabelText('カスタムカラーを適用'))
    expect(onChange).toHaveBeenCalledWith('#AABBCC')
  })

  it('Enter キーでカスタム色を確定できる', () => {
    renderPopover()
    const input = screen.getByLabelText('カスタムカラー入力')
    fireEvent.change(input, { target: { value: '#ABCDEF' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('#ABCDEF')
  })

  it('Escape キーで onClose が呼ばれる', () => {
    renderPopover()
    const input = screen.getByLabelText('カスタムカラー入力')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('管理ボタンが表示される', () => {
    renderPopover()
    expect(screen.getByText('管理')).toBeInTheDocument()
  })
})
