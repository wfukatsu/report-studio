import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartPropertiesPanel } from './PropertiesPanel'
import type { ChartElement } from '@/types'

function makeEl(overrides?: Partial<ChartElement>): ChartElement {
  return {
    id: 'ch-1', type: 'chart',
    position: { x: 0, y: 0 }, size: { width: 80, height: 60 },
    zIndex: 1, visible: true, locked: false,
    chartType: 'bar',
    ...overrides,
  }
}

describe('ChartPropertiesPanel', () => {
  it('renders without error', () => {
    render(<ChartPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('グラフ')).toBeInTheDocument()
  })

  it('shows chart type selector with bar selected', () => {
    render(<ChartPropertiesPanel el={makeEl({ chartType: 'bar' })} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('棒グラフ')).toBeInTheDocument()
  })

  it('calls onChange when chart type changes', () => {
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('棒グラフ'), { target: { value: 'pie' } })
    expect(onChange).toHaveBeenCalledWith({ chartType: 'pie' })
  })

  it('renders タイトル label', () => {
    render(<ChartPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('タイトル')).toBeInTheDocument()
  })

  it('calls onChange when xAxisKey changes', () => {
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={makeEl()} onChange={onChange} />)
    const input = screen.getByPlaceholderText('例: name')
    fireEvent.change(input, { target: { value: 'month' } })
    expect(onChange).toHaveBeenCalledWith({ xAxisKey: 'month' })
  })

  it('calls onChange when yAxisKeys changes', () => {
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={makeEl()} onChange={onChange} />)
    const input = screen.getByPlaceholderText('例: revenue, cost')
    fireEvent.change(input, { target: { value: 'sales, returns' } })
    expect(onChange).toHaveBeenCalledWith({ yAxisKeys: ['sales', 'returns'] })
  })

  it('calls onChange when showLegend checkbox changes', () => {
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={makeEl({ showLegend: true })} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // showLegend checkbox
    expect(onChange).toHaveBeenCalledWith({ showLegend: false })
  })

  it('calls onChange when showGrid checkbox changes (non-pie chart)', () => {
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={makeEl({ chartType: 'bar', showGrid: true })} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // showGrid is the second checkbox for non-pie charts
    fireEvent.click(checkboxes[1])
    expect(onChange).toHaveBeenCalledWith({ showGrid: false })
  })
})
