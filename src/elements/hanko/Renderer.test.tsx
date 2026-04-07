import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HankoRenderer } from './Renderer'
import type { HankoElement } from '@/types'

function makeElement(overrides: Partial<HankoElement> = {}): HankoElement {
  return {
    id: 'hanko-1',
    type: 'hanko',
    position: { x: 10, y: 10 },
    size: { width: 20, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    text: '印',
    shape: 'circle',
    borderColor: '#cc0000',
    textColor: '#cc0000',
    fontSize: 4,
    writingMode: 'vertical-rl',
    doubleBorder: true,
    ...overrides,
  } as HankoElement
}

describe('HankoRenderer — circle shape', () => {
  it('renders an SVG', () => {
    const { container } = render(<HankoRenderer element={makeElement()} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders circle elements', () => {
    const { container } = render(<HankoRenderer element={makeElement()} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  it('renders the hanko text', () => {
    render(<HankoRenderer element={makeElement({ text: '承認' })} />)
    expect(screen.getByText('承認')).toBeInTheDocument()
  })

  it('renders single border circle when doubleBorder is false', () => {
    const { container } = render(
      <HankoRenderer element={makeElement({ doubleBorder: false })} />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(1)
  })

  it('renders double border circles when doubleBorder is true', () => {
    const { container } = render(
      <HankoRenderer element={makeElement({ doubleBorder: true })} />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
  })

  it('resolves text from data binding when binding is set', () => {
    render(
      <HankoRenderer
        element={makeElement({ binding: 'stampText' })}
        data={{ stampText: '田中' }}
      />,
    )
    expect(screen.getByText('田中')).toBeInTheDocument()
  })
})

describe('HankoRenderer — rect shape', () => {
  it('renders rect elements for square shape', () => {
    const { container } = render(
      <HankoRenderer element={makeElement({ shape: 'square' })} />,
    )
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(0)
  })
})
