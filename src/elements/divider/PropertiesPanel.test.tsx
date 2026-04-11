import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DividerPropertiesPanel } from './PropertiesPanel'
import type { DividerElement } from '@/types'

function makeEl(overrides?: Partial<DividerElement>): DividerElement {
  return {
    id: 'd-1', type: 'divider',
    position: { x: 0, y: 0 }, size: { width: 80, height: 2 },
    zIndex: 1, visible: true, locked: false,
    direction: 'horizontal', color: '#000000', thickness: 0.5, dashStyle: 'solid',
    ...overrides,
  }
}

describe('DividerPropertiesPanel', () => {
  it('renders without error', () => {
    render(<DividerPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('区切り線')).toBeInTheDocument()
  })

  it('shows current direction selected', () => {
    render(<DividerPropertiesPanel el={makeEl({ direction: 'horizontal' })} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('水平')).toBeInTheDocument()
  })

  it('swaps size dimensions when direction changes', () => {
    const onChange = vi.fn()
    render(
      <DividerPropertiesPanel
        el={makeEl({ direction: 'horizontal', size: { width: 80, height: 2 } })}
        onChange={onChange}
      />,
    )
    const select = screen.getByDisplayValue('水平')
    fireEvent.change(select, { target: { value: 'vertical' } })
    expect(onChange).toHaveBeenCalledWith({
      direction: 'vertical',
      size: { width: 2, height: 80 }, // swapped
    })
  })

  it('does not call onChange when selecting the same direction', () => {
    const onChange = vi.fn()
    render(<DividerPropertiesPanel el={makeEl({ direction: 'horizontal' })} onChange={onChange} />)
    const select = screen.getByDisplayValue('水平')
    fireEvent.change(select, { target: { value: 'horizontal' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange when dashStyle changes', () => {
    const onChange = vi.fn()
    render(<DividerPropertiesPanel el={makeEl()} onChange={onChange} />)
    const select = screen.getByDisplayValue('実線')
    fireEvent.change(select, { target: { value: 'dashed' } })
    expect(onChange).toHaveBeenCalledWith({ dashStyle: 'dashed' })
  })
})
