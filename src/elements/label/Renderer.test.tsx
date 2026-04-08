import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabelRenderer } from './Renderer'
import type { LabelElement, TextStyle } from '@/types'

function makeElement(overrides: Partial<LabelElement> = {}): LabelElement {
  return {
    id: 'lbl-1',
    type: 'label',
    position: { x: 10, y: 10 },
    size: { width: 40, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    text: 'テスト',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as LabelElement
}

function s(overrides: Partial<TextStyle>): TextStyle {
  return { fontSize: 3.5, fontWeight: 'normal', color: '#000', ...overrides } as TextStyle
}

describe('LabelRenderer — 基本', () => {
  it('renders the label text', () => {
    render(<LabelRenderer element={makeElement()} />)
    expect(screen.getByText('テスト')).toBeInTheDocument()
  })

  it('applies font size', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ fontSize: 6 }) })} />)
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.fontSize).toBe('6mm')
  })

  it('applies text color', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ color: '#0000ff' }) })} />)
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.color).toBe('rgb(0, 0, 255)')
  })
})

// ═══════════════════════════════════════════════════════════
// 横書き（horizontal-tb）
// ═══════════════════════════════════════════════════════════
describe('LabelRenderer — 横書き', () => {
  // 横揃え → text-align（インライン方向 = 左→右）
  it.each([
    ['left', 'left'],
    ['center', 'center'],
    ['right', 'right'],
    ['justify', 'justify'],
  ] as const)('横揃え %s → text-align: %s', (textAlign, expected) => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign }) })} />)
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe(expected)
  })

  // 均等寄せ → text-align:justify + text-align-last:justify（Word型: 1行でも均等配置）
  it('横揃え justify → text-align-last: justify（1行テキストでも均等配置）', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign: 'justify' }) })} />)
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe('justify')
    expect(inner.style.textAlignLast).toBe('justify')
  })

  it('横揃え left → text-align-last は未設定', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign: 'left' }) })} />)
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlignLast).toBe('')
  })

  // 縦揃え → justify-content（ブロック方向 = 上→下）
  it.each([
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
  ] as const)('縦揃え %s → justify-content: %s', (verticalAlign, expected) => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ verticalAlign }) })} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.justifyContent).toBe(expected)
  })

  // 組み合わせ: 横揃え right + 縦揃え bottom
  it('横揃え right + 縦揃え bottom', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign: 'right', verticalAlign: 'bottom' }) })} />)
    const outer = container.firstChild as HTMLElement
    const inner = outer.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe('right')
    expect(outer.style.justifyContent).toBe('flex-end')
  })
})

// ═══════════════════════════════════════════════════════════
// 縦書き（vertical-rl）— CSS 論理軸モデル
//
// 横揃え: text-align がインライン方向（上→下）を制御
//   left → 上、center → 中央、right → 下、justify → 上下均等
//
// 縦揃え: justify-content がブロック方向（右→左）を制御
//   top → flex-start → 右、middle → center、bottom → flex-end → 左
// ═══════════════════════════════════════════════════════════
describe('LabelRenderer — 縦書き', () => {
  // 外側に writing-mode: vertical-rl が設定される
  it('outer に writing-mode: vertical-rl', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ writingMode: 'vertical-rl' }) })} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.writingMode).toBe('vertical-rl')
  })

  // 横揃え → text-align（インライン方向: left=上、center=中央、right=下）
  it.each([
    ['left', 'left'],     // left → インライン開始 → 上
    ['center', 'center'], // center → 中央
    ['right', 'right'],   // right → インライン終端 → 下
    ['justify', 'justify'], // justify → 上下均等
  ] as const)('横揃え %s → text-align: %s', (textAlign, expected) => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign, writingMode: 'vertical-rl' }) })} />)
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe(expected)
  })

  // 縦揃え → justify-content（ブロック方向: top=flex-start→右、bottom=flex-end→左）
  it.each([
    ['top', 'flex-start'],  // top → ブロック開始 → 右
    ['middle', 'center'],   // middle → 中央
    ['bottom', 'flex-end'], // bottom → ブロック終端 → 左
  ] as const)('縦揃え %s → justify-content: %s', (verticalAlign, expected) => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ verticalAlign, writingMode: 'vertical-rl' }) })} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.justifyContent).toBe(expected)
  })

  // 組み合わせ: 横揃え right + 縦揃え bottom → 下に寄せ + 左に寄せ
  it('横揃え right + 縦揃え bottom', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign: 'right', verticalAlign: 'bottom', writingMode: 'vertical-rl' }) })} />)
    const outer = container.firstChild as HTMLElement
    const inner = outer.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe('right')
    expect(outer.style.justifyContent).toBe('flex-end')
  })

  // 組み合わせ: 横揃え center + 縦揃え middle → 中央
  it('横揃え center + 縦揃え middle', () => {
    const { container } = render(<LabelRenderer element={makeElement({ style: s({ textAlign: 'center', verticalAlign: 'middle', writingMode: 'vertical-rl' }) })} />)
    const outer = container.firstChild as HTMLElement
    const inner = outer.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe('center')
    expect(outer.style.justifyContent).toBe('center')
  })
})
