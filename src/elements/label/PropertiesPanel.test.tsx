import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LabelPropertiesPanel } from './PropertiesPanel'
import type { LabelElement } from '@/types'

function makeEl(overrides?: Partial<LabelElement>): LabelElement {
  return {
    id: 'lbl-1', type: 'label',
    position: { x: 0, y: 0 }, size: { width: 50, height: 8 },
    zIndex: 1, visible: true, locked: false,
    text: 'ラベルテキスト',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  }
}

describe('LabelPropertiesPanel', () => {
  it('renders without error', () => {
    render(<LabelPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('テキストスタイル')).toBeInTheDocument()
  })

  it('calls onChange when text content changes', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl({ text: 'テスト' })} onChange={onChange} />)
    const textarea = screen.getByDisplayValue('テスト')
    fireEvent.change(textarea, { target: { value: '新しいテキスト' } })
    expect(onChange).toHaveBeenCalledWith({ text: '新しいテキスト' })
  })

  it('calls onChange when font weight bold is toggled', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('太字'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when text alignment changes', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl()} onChange={onChange} />)
    // Click center alignment icon
    fireEvent.click(screen.getByTitle('center'))
    expect(onChange).toHaveBeenCalled()
  })

  it('renders text content label', () => {
    render(<LabelPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('テキスト')).toBeInTheDocument()
  })

  it('calls onChange when font size changes', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl()} onChange={onChange} />)
    const sizeInput = screen.getByDisplayValue('3.5')
    fireEvent.change(sizeInput, { target: { value: '5' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when color changes', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl()} onChange={onChange} />)
    const colorTextInputs = screen.getAllByDisplayValue('#000000')
    fireEvent.change(colorTextInputs[0], { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when vertical align changes', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('middle'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when writing mode changes to vertical', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('縦書き'))
    expect(onChange).toHaveBeenCalled()
  })
})
