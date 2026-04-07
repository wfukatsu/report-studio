import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartRenderer } from './Renderer'
import type { ChartElement } from '@/types'

function makeElement(overrides: Partial<ChartElement> = {}): ChartElement {
  return {
    id: 'chart-1',
    type: 'chart',
    position: { x: 10, y: 10 },
    size: { width: 80, height: 50 },
    zIndex: 1,
    visible: true,
    locked: false,
    chartType: 'bar',
    labels: ['A', 'B', 'C'],
    datasets: [{ label: 'データ', data: [1, 2, 3], color: '#3b82f6' }],
    ...overrides,
  } as ChartElement
}

describe('ChartRenderer', () => {
  it('renders without error', () => {
    const { container } = render(<ChartRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows chart type in placeholder', () => {
    render(<ChartRenderer element={makeElement({ chartType: 'bar' })} />)
    expect(screen.getByText('[bar chart]')).toBeInTheDocument()
  })

  it('shows different chart types', () => {
    render(<ChartRenderer element={makeElement({ chartType: 'line' })} />)
    expect(screen.getByText('[line chart]')).toBeInTheDocument()
  })

  it('renders pie chart type', () => {
    render(<ChartRenderer element={makeElement({ chartType: 'pie' })} />)
    expect(screen.getByText('[pie chart]')).toBeInTheDocument()
  })
})
