import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TextRenderer } from './Renderer'
import type { TextElement } from '@/types'

function makeElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'el-1',
    type: 'text',
    position: { x: 10, y: 10 },
    size: { width: 50, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    content: 'Hello World',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as TextElement
}

describe('TextRenderer', () => {
  it('renders content text', () => {
    render(<TextRenderer element={makeElement()} />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('interpolates data tokens in content', () => {
    render(
      <TextRenderer
        element={makeElement({ content: 'Dear {{name}}' })}
        data={{ name: 'Alice' }}
      />,
    )
    expect(screen.getByText('Dear Alice')).toBeInTheDocument()
  })

  it('renders without error when token has no matching data', () => {
    // Should not throw — just renders whatever interpolate returns
    const { container } = render(
      <TextRenderer
        element={makeElement({ content: '{{unknown}}' })}
        data={{}}
      />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('applies font size from style', () => {
    const { container } = render(
      <TextRenderer element={makeElement({ style: { fontSize: 5, fontWeight: 'bold', color: '#ff0000', textAlign: 'center' } })} />,
    )
    const span = container.firstChild!.firstChild as HTMLElement
    expect(span.style.fontSize).toBe('5mm')
  })

  it('applies font weight', () => {
    const { container } = render(
      <TextRenderer element={makeElement({ style: { fontSize: 3.5, fontWeight: 'bold', color: '#000000', textAlign: 'left' } })} />,
    )
    const span = container.firstChild!.firstChild as HTMLElement
    expect(span.style.fontWeight).toBe('bold')
  })

  it('renders furigana when furigana prop set', () => {
    render(
      <TextRenderer element={makeElement({ content: '漢字', furigana: 'かんじ' })} />,
    )
    expect(screen.getByText('かんじ')).toBeInTheDocument()
  })

  it('applies text alignment via flexbox', () => {
    const { container } = render(
      <TextRenderer element={makeElement({ style: { fontSize: 3.5, fontWeight: 'normal', color: '#000', textAlign: 'center' } })} />,
    )
    const div = container.firstChild as HTMLElement
    expect(div.style.justifyContent).toBe('center')
  })

  it('applies color', () => {
    const { container } = render(
      <TextRenderer element={makeElement({ style: { fontSize: 3.5, fontWeight: 'normal', color: '#ff0000', textAlign: 'left' } })} />,
    )
    const span = container.firstChild!.firstChild as HTMLElement
    expect(span.style.color).toBe('rgb(255, 0, 0)')
  })
})
