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

describe('LabelPropertiesPanel — toggle off (ternary else branches)', () => {
  it('clicking 太字 when bold sets fontWeight to normal', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl({ style: { fontWeight: 'bold' } })} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('太字'))
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0]
    expect(patch.style?.fontWeight).toBe('normal')
  })

  it('clicking 斜体 when italic sets fontStyle to normal', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl({ style: { fontStyle: 'italic' } })} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('斜体'))
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0]
    expect(patch.style?.fontStyle).toBe('normal')
  })

  it('clicking 下線 when underline sets textDecoration to none', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl({ style: { textDecoration: 'underline' } })} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('下線'))
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0]
    expect(patch.style?.textDecoration).toBe('none')
  })

  it('clicking 打ち消し線 when line-through sets textDecoration to none', () => {
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={makeEl({ style: { textDecoration: 'line-through' } })} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('打ち消し線'))
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0]
    expect(patch.style?.textDecoration).toBe('none')
  })

  it('fontSize ?? fallback uses 3.5 when style.fontSize undefined', () => {
    render(<LabelPropertiesPanel el={makeEl({ style: {} })} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('3.5')).toBeInTheDocument()
  })

  it('color ?? fallback uses #000000 when style.color undefined', () => {
    render(<LabelPropertiesPanel el={makeEl({ style: {} })} onChange={vi.fn()} />)
    // ColorInput should show #000000 as default
    const colorInputs = screen.getAllByDisplayValue('#000000')
    expect(colorInputs.length).toBeGreaterThan(0)
  })
})
