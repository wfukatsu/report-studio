import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DividerRenderer } from './Renderer'
import type { DividerElement } from '@/types'

function makeElement(overrides?: Partial<DividerElement>): DividerElement {
  return {
    id: 'div-1',
    type: 'divider',
    position: { x: 0, y: 0 },
    size: { width: 80, height: 2 },
    zIndex: 1,
    visible: true,
    locked: false,
    direction: 'horizontal',
    color: '#000000',
    thickness: 0.5,
    dashStyle: 'solid',
    ...overrides,
  }
}

describe('DividerRenderer', () => {
  it('renders a horizontal divider as SVG line', () => {
    const { container } = render(<DividerRenderer element={makeElement()} />)
    const line = container.querySelector('line')
    expect(line).toBeInTheDocument()
    // horizontal: y1 === y2 at mid-height
    expect(line?.getAttribute('x1')).toBe('0')
    expect(line?.getAttribute('x2')).toBe('80') // el.size.width
    expect(line?.getAttribute('y1')).toBe('1') // height/2 = 2/2
  })

  it('renders a vertical divider', () => {
    const { container } = render(
      <DividerRenderer element={makeElement({ direction: 'vertical', size: { width: 2, height: 60 } })} />,
    )
    const line = container.querySelector('line')
    expect(line).toBeInTheDocument()
    expect(line?.getAttribute('y2')).toBe('60') // el.size.height
  })

  it('applies stroke color', () => {
    const { container } = render(
      <DividerRenderer element={makeElement({ color: '#ff0000' })} />,
    )
    const line = container.querySelector('line')
    expect(line?.getAttribute('stroke')).toBe('#ff0000')
  })

  it('uses solid dash array for solid style', () => {
    const { container } = render(
      <DividerRenderer element={makeElement({ dashStyle: 'solid' })} />,
    )
    const line = container.querySelector('line')
    expect(line?.getAttribute('stroke-dasharray')).toBe('none')
  })

  it('uses dashed pattern for dashed style', () => {
    const { container } = render(
      <DividerRenderer element={makeElement({ dashStyle: 'dashed' })} />,
    )
    const line = container.querySelector('line')
    expect(line?.getAttribute('stroke-dasharray')).toBe('4mm 2mm')
  })

  it('uses dotted pattern for dotted style', () => {
    const { container } = render(
      <DividerRenderer element={makeElement({ dashStyle: 'dotted' })} />,
    )
    const line = container.querySelector('line')
    expect(line?.getAttribute('stroke-dasharray')).toBe('1mm 1mm')
  })

  it('applies thickness as strokeWidth', () => {
    const { container } = render(
      <DividerRenderer element={makeElement({ thickness: 1.5 })} />,
    )
    const line = container.querySelector('line')
    expect(line?.getAttribute('stroke-width')).toBe('1.5mm')
  })
})
