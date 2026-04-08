import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabelRenderer } from './Renderer'
import type { LabelElement } from '@/types'

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
      <LabelRenderer element={makeElement({ style: { fontSize: 6, fontWeight: 'normal', color: '#000', textAlign: 'left' } })} />,
    )
    const span = container.firstChild!.firstChild as HTMLElement
    expect(span.style.fontSize).toBe('6mm')
  })

  it('applies text color', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: { fontSize: 3.5, fontWeight: 'normal', color: '#0000ff', textAlign: 'left' } })} />,
    )
    const span = container.firstChild!.firstChild as HTMLElement
    expect(span.style.color).toBe('rgb(0, 0, 255)')
  })

  it('applies text alignment via flexbox justify-content', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: { fontSize: 3.5, fontWeight: 'normal', color: '#000', textAlign: 'right' } })} />,
    )
    const div = container.firstChild as HTMLElement
    expect(div.style.justifyContent).toBe('flex-end')
  })

  it('applies wordBreak:break-all when writingMode is vertical-rl', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: { fontSize: 2.5, fontWeight: 'normal', color: '#000', textAlign: 'center', writingMode: 'vertical-rl' } })} />,
    )
    const span = container.firstChild!.firstChild as HTMLElement
    expect(span.style.wordBreak).toBe('break-all')
  })

  it('does not set wordBreak when writingMode is horizontal-tb', () => {
    const { container } = render(
      <LabelRenderer element={makeElement({ style: { fontSize: 3.5, fontWeight: 'normal', color: '#000', textAlign: 'left' } })} />,
    )
    const div = container.firstChild as HTMLElement
    expect(div.style.wordBreak).toBe('')
  })

  it('renders vertical text without \\n correctly', () => {
    render(
      <LabelRenderer element={makeElement({ text: '主たる給与から控除を受ける', style: { fontSize: 2.5, fontWeight: 'normal', color: '#000', textAlign: 'center', writingMode: 'vertical-rl' } })} />,
    )
    expect(screen.getByText('主たる給与から控除を受ける')).toBeInTheDocument()
  })
})
