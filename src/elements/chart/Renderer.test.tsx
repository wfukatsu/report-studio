import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
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
    xAxisKey: 'name',
    yAxisKeys: ['value'],
    ...overrides,
  } as ChartElement
}

describe('ChartRenderer', () => {
  it('renders without error', () => {
    const { container } = render(<ChartRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders bar chart with sample data', () => {
    const { container } = render(<ChartRenderer element={makeElement({ chartType: 'bar' })} />)
    // Recharts renders SVG-based charts via ResponsiveContainer
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders line chart', () => {
    const { container } = render(<ChartRenderer element={makeElement({ chartType: 'line' })} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders pie chart', () => {
    const { container } = render(<ChartRenderer element={makeElement({ chartType: 'pie' })} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders with data binding', () => {
    const data = { sales: [{ name: 'Jan', value: 100 }, { name: 'Feb', value: 200 }] }
    const { container } = render(
      <ChartRenderer element={makeElement({ dataBinding: 'sales' })} data={data} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows title when set', () => {
    const { container } = render(<ChartRenderer element={makeElement({ title: '売上' })} />)
    expect(container.textContent).toContain('売上')
  })
})
