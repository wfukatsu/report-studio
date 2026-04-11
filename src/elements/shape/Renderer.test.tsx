import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ShapeRenderer } from './Renderer'
import type { ShapeElement } from '@/types'

function makeElement(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: 'shape-1',
    type: 'shape',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    shape: 'rectangle',
    fill: 'transparent',
    stroke: '#000000',
    strokeWidth: 0.3,
    strokeDash: 'solid',
    ...overrides,
  } as ShapeElement
}

describe('ShapeRenderer — rectangle', () => {
  it('renders an SVG for rectangle', () => {
    const { container } = render(<ShapeRenderer element={makeElement()} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('rect')).toBeInTheDocument()
  })

  it('applies fill color', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ fill: '#ff0000' })} />,
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('fill')).toBe('#ff0000')
  })

  it('applies stroke color', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ stroke: '#0000ff' })} />,
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('stroke')).toBe('#0000ff')
  })
})

describe('ShapeRenderer — circle', () => {
  it('renders an ellipse for circle shape', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'circle' })} />,
    )
    expect(container.querySelector('ellipse')).toBeInTheDocument()
    expect(container.querySelector('rect')).not.toBeInTheDocument()
  })
})

describe('ShapeRenderer — line', () => {
  it('renders a line element for line shape', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'line', size: { width: 53, height: 0.5 } })} />,
    )
    expect(container.querySelector('line')).toBeInTheDocument()
  })

  it('renders horizontal line when width > height', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'line', size: { width: 53, height: 0.1 } })} />,
    )
    const line = container.querySelector('line')!
    expect(line.getAttribute('x1')).toBe('0')
    expect(line.getAttribute('x2')).toBe('100%')
    expect(line.getAttribute('y1')).toBe('50%')
    expect(line.getAttribute('y2')).toBe('50%')
  })

  it('renders vertical line when height > width', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'line', size: { width: 0.1, height: 30 } })} />,
    )
    const line = container.querySelector('line')!
    expect(line.getAttribute('x1')).toBe('50%')
    expect(line.getAttribute('x2')).toBe('50%')
    expect(line.getAttribute('y1')).toBe('0')
    expect(line.getAttribute('y2')).toBe('100%')
  })
})

describe('ShapeRenderer — dash styles', () => {
  it('applies dashed stroke dasharray', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ strokeDash: 'dashed' })} />,
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('stroke-dasharray')).toBe('6 3')
  })

  it('applies dotted stroke dasharray', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ strokeDash: 'dotted' })} />,
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('stroke-dasharray')).toBe('2 2')
  })

  it('applies none for solid', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ strokeDash: 'solid' })} />,
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('stroke-dasharray')).toBe('none')
  })
})

describe('ShapeRenderer — default fallbacks (undefined props)', () => {
  it('uses default stroke #000000 when not set', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ stroke: undefined })} />,
    )
    expect(container.querySelector('rect')!.getAttribute('stroke')).toBe('#000000')
  })

  it('uses default strokeWidth 0.3 when not set', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ strokeWidth: undefined })} />,
    )
    expect(container.querySelector('rect')!.getAttribute('stroke-width')).toBe('0.3')
  })

  it('uses default fill transparent when not set on circle', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'circle', fill: undefined })} />,
    )
    expect(container.querySelector('ellipse')!.getAttribute('fill')).toBe('transparent')
  })

  it('applies borderRadius on rectangle when set', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'rectangle', borderRadius: 3 })} />,
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('rx')).toBe('3mm')
    expect(rect.getAttribute('ry')).toBe('3mm')
  })

  it('rx/ry is undefined when borderRadius not set', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'rectangle', borderRadius: undefined })} />,
    )
    const rect = container.querySelector('rect')!
    // rx/ry should be absent or null
    expect(rect.getAttribute('rx')).toBeNull()
  })

  it('uses solid dash fallback when strokeDash is undefined', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ strokeDash: undefined })} />,
    )
    expect(container.querySelector('rect')!.getAttribute('stroke-dasharray')).toBe('none')
  })

  it('uses default stroke on vertical line when stroke not set', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'line', size: { width: 0.1, height: 30 }, stroke: undefined })} />,
    )
    expect(container.querySelector('line')!.getAttribute('stroke')).toBe('#000000')
  })

  it('uses default stroke on horizontal line when stroke not set', () => {
    const { container } = render(
      <ShapeRenderer element={makeElement({ shape: 'line', size: { width: 50, height: 0.5 }, stroke: undefined })} />,
    )
    expect(container.querySelector('line')!.getAttribute('stroke')).toBe('#000000')
  })
})
