import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormatSection } from './FormatSection'
import type { CalculationFormat } from '@/types'

describe('FormatSection', () => {
  it('renders with no format (なし selected)', () => {
    render(<FormatSection format={undefined} onChange={vi.fn()} />)
    expect(screen.getByText('書式')).toBeInTheDocument()
    expect(screen.getByDisplayValue('なし')).toBeInTheDocument()
  })

  it('calls onChange with undefined when "なし" is selected', () => {
    const onChange = vi.fn()
    render(<FormatSection format={{ type: 'integer' }} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('整数'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('calls onChange with correct type when format type changes', () => {
    const onChange = vi.fn()
    render(<FormatSection format={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('なし'), { target: { value: 'integer' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'integer' }))
  })

  it('shows decimal places input when type is decimal', () => {
    render(<FormatSection format={{ type: 'decimal', decimalPlaces: 2 }} onChange={vi.fn()} />)
    expect(screen.getByText('小数桁数')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  })

  it('hides decimal places input for non-decimal types', () => {
    render(<FormatSection format={{ type: 'integer' }} onChange={vi.fn()} />)
    expect(screen.queryByText('小数桁数')).not.toBeInTheDocument()
  })

  it('calls onChange when decimal places change', () => {
    const onChange = vi.fn()
    render(<FormatSection format={{ type: 'decimal', decimalPlaces: 2 }} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ decimalPlaces: 3 }))
  })

  it('shows custom pattern input when type is custom', () => {
    render(<FormatSection format={{ type: 'custom', customPattern: '#,##0' }} onChange={vi.fn()} />)
    expect(screen.getByText('パターン')).toBeInTheDocument()
    expect(screen.getByDisplayValue('#,##0')).toBeInTheDocument()
  })

  it('hides custom pattern input for non-custom types', () => {
    render(<FormatSection format={{ type: 'integer' }} onChange={vi.fn()} />)
    expect(screen.queryByText('パターン')).not.toBeInTheDocument()
  })

  it('calls onChange when custom pattern changes', () => {
    const onChange = vi.fn()
    render(<FormatSection format={{ type: 'custom', customPattern: '' }} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText('例: #,##0.00'), { target: { value: '¥#,##0' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ customPattern: '¥#,##0' }))
  })

  it('selecting decimal type preserves existing decimalPlaces', () => {
    const onChange = vi.fn()
    render(<FormatSection format={{ type: 'integer' }} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('整数'), { target: { value: 'decimal' } })
    const call = onChange.mock.calls[0][0] as CalculationFormat
    expect(call.type).toBe('decimal')
    expect(call.decimalPlaces).toBeDefined()
  })

  it('selecting custom type sets empty customPattern', () => {
    const onChange = vi.fn()
    render(<FormatSection format={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('なし'), { target: { value: 'custom' } })
    const call = onChange.mock.calls[0][0] as CalculationFormat
    expect(call.type).toBe('custom')
    expect(call.customPattern).toBe('')
  })
})
