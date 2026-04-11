import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShapePropertiesPanel } from './PropertiesPanel'
import type { ShapeElement } from '@/types'

function makeEl(overrides?: Partial<ShapeElement>): ShapeElement {
  return {
    id: 's-1', type: 'shape',
    position: { x: 0, y: 0 }, size: { width: 60, height: 40 },
    zIndex: 1, visible: true, locked: false,
    shape: 'rectangle', stroke: '#000000', strokeWidth: 0.3, strokeDash: 'solid',
    ...overrides,
  } as ShapeElement
}

describe('ShapePropertiesPanel', () => {
  it('renders without error', () => {
    render(<ShapePropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('図形')).toBeInTheDocument()
  })

  it('shows shape selector with rectangle selected', () => {
    render(<ShapePropertiesPanel el={makeEl({ shape: 'rectangle' })} onChange={vi.fn()} />)
    const select = screen.getByDisplayValue('矩形')
    expect(select).toBeInTheDocument()
  })

  it('calls onChange when shape changes', () => {
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={makeEl()} onChange={onChange} />)
    const select = screen.getByDisplayValue('矩形')
    fireEvent.change(select, { target: { value: 'circle' } })
    expect(onChange).toHaveBeenCalledWith({ shape: 'circle' })
  })

  it('shows border radius input only for rectangle', () => {
    render(<ShapePropertiesPanel el={makeEl({ shape: 'rectangle' })} onChange={vi.fn()} />)
    expect(screen.getByText('角丸')).toBeInTheDocument()
  })

  it('hides border radius input for non-rectangle shapes', () => {
    render(<ShapePropertiesPanel el={makeEl({ shape: 'circle' })} onChange={vi.fn()} />)
    expect(screen.queryByText('角丸')).not.toBeInTheDocument()
  })

  it('calls onChange when strokeDash changes', () => {
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={makeEl()} onChange={onChange} />)
    const select = screen.getByDisplayValue('実線')
    fireEvent.change(select, { target: { value: 'dashed' } })
    expect(onChange).toHaveBeenCalledWith({ strokeDash: 'dashed' })
  })

  it('calls onChange when fill color changes', () => {
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={makeEl({ fill: '#ffffff' })} onChange={onChange} />)
    // There are two ColorInput pairs — first is fill (#ffffff), second is stroke (#000000)
    const fillTextInputs = screen.getAllByDisplayValue('#ffffff')
    fireEvent.change(fillTextInputs[0], { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith({ fill: '#ff0000' })
  })

  it('calls onChange when stroke color changes', () => {
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={makeEl({ stroke: '#000000' })} onChange={onChange} />)
    const strokeInputs = screen.getAllByDisplayValue('#000000')
    fireEvent.change(strokeInputs[0], { target: { value: '#0000ff' } })
    expect(onChange).toHaveBeenCalledWith({ stroke: '#0000ff' })
  })

  it('calls onChange when strokeWidth changes', () => {
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={makeEl({ strokeWidth: 0.3 })} onChange={onChange} />)
    const widthInput = screen.getByDisplayValue('0.3')
    fireEvent.change(widthInput, { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith({ strokeWidth: 1 })
  })
})
