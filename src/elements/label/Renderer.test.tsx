import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabelRenderer } from './Renderer'
import type { LabelElement, TextStyle } from '@/types'

function makeElement(overrides: Partial<LabelElement> = {}): LabelElement {
  return {
    id: 'lbl-1',
    type: 'label',
    position: { x: 10, y: 10 },
    size: { width: 40, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    text: 'ラベルテキスト',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as LabelElement
}

function s(overrides: Partial<TextStyle>): TextStyle {
  return { fontSize: 3.5, fontWeight: 'normal', color: '#000', ...overrides } as TextStyle
}

describe('LabelRenderer', () => {
  it('renders the label text', () => {
    render(<LabelRenderer element={makeElement()} />)
    expect(screen.getByText('ラベルテキスト')).toBeInTheDocument()
  })

  it('renders custom text', () => {
    render(<LabelRenderer element={makeElement({ text: 'カスタムラベル' })} />)
    expect(screen.getByText('カスタムラベル')).toBeInTheDocument()
  })

  it('applies font size from style', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ fontSize: 6 }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.fontSize).toBe('6mm')
  })

  it('applies text color', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ color: '#0000ff' }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.color).toBe('rgb(0, 0, 255)')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 横書き × 横揃え・縦揃え 全組み合わせ
// ═══════════════════════════════════════════════════════════════════
describe('LabelRenderer — 横書きモード アライメント', () => {
  // 横揃え → inner div の text-align
  it.each([
    ['left', 'left'],
    ['center', 'center'],
    ['right', 'right'],
    ['justify', 'justify'],
  ] as const)('横揃え %s → inner text-align: %s', (textAlign, expected) => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ textAlign }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe(expected)
  })

  // 横揃え justify → text-align-last: justify
  it('横揃え justify → text-align-last: justify', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ textAlign: 'justify' }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlignLast).toBe('justify')
  })

  // 縦揃え → outer の flex justify-content（flex-direction: column）
  it.each([
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
  ] as const)('縦揃え %s → outer justify-content: %s', (verticalAlign, expected) => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ verticalAlign }) })} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('column')
    expect(outer.style.justifyContent).toBe(expected)
  })

  // 横揃え right + 縦揃え bottom（組み合わせ）
  it('横揃え right + 縦揃え bottom', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ textAlign: 'right', verticalAlign: 'bottom' }) })} />,
    )
    const outer = container.firstChild as HTMLElement
    const inner = outer.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe('right')
    expect(outer.style.justifyContent).toBe('flex-end')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 縦書き × 横揃え・縦揃え 全組み合わせ
// ═══════════════════════════════════════════════════════════════════
describe('LabelRenderer — 縦書きモード アライメント', () => {
  // 横揃え → outer の flex justify-content（flex-direction: row で水平配置）
  it.each([
    ['left', 'flex-start'],
    ['center', 'center'],
    ['right', 'flex-end'],
  ] as const)('横揃え %s → outer justify-content: %s (flex-direction: row)', (textAlign, expected) => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ textAlign, writingMode: 'vertical-rl' }) })} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('row')
    expect(outer.style.justifyContent).toBe(expected)
  })

  // 縦揃え → inner の text-align（vertical-rl の inline 方向にマッピング）
  // top → left (inline start), middle → center, bottom → right (inline end)
  it.each([
    ['top', 'left'],
    ['middle', 'center'],
    ['bottom', 'right'],
  ] as const)('縦揃え %s → inner text-align: %s', (verticalAlign, expected) => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ verticalAlign, writingMode: 'vertical-rl' }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.textAlign).toBe(expected)
  })

  // 横揃え right + 縦揃え bottom（組み合わせ）
  it('横揃え right + 縦揃え bottom', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ textAlign: 'right', verticalAlign: 'bottom', writingMode: 'vertical-rl' }) })} />,
    )
    const outer = container.firstChild as HTMLElement
    const inner = outer.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('row')
    expect(outer.style.justifyContent).toBe('flex-end')
    expect(inner.style.textAlign).toBe('right')
  })

  // 横揃え center + 縦揃え middle（組み合わせ）
  it('横揃え center + 縦揃え middle', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ textAlign: 'center', verticalAlign: 'middle', writingMode: 'vertical-rl' }) })} />,
    )
    const outer = container.firstChild as HTMLElement
    const inner = outer.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('row')
    expect(outer.style.justifyContent).toBe('center')
    expect(inner.style.textAlign).toBe('center')
  })

  // inner に writing-mode: vertical-rl が設定される
  it('inner div に writing-mode: vertical-rl が設定される', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ writingMode: 'vertical-rl' }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.writingMode).toBe('vertical-rl')
  })

  // inner は height: 100%（縦書きで縦全体を使う）
  it('inner div は height: 100%', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: s({ writingMode: 'vertical-rl' }) })} />,
    )
    const inner = container.firstChild!.firstChild as HTMLElement
    expect(inner.style.height).toBe('100%')
  })
})
