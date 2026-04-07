import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FieldKeyInput } from './FieldKeyInput'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('FieldKeyInput', () => {
  it('renders a text input without crashing', () => {
    const onChange = vi.fn()
    render(<FieldKeyInput value="" onChange={onChange} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('displays the current value', () => {
    const onChange = vi.fn()
    render(<FieldKeyInput value="customer.name" onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('customer.name')
  })

  it('calls onChange when user types', () => {
    const onChange = vi.fn()
    render(<FieldKeyInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'new.field' } })
    expect(onChange).toHaveBeenCalledWith('new.field')
  })

  it('renders with placeholder text', () => {
    const onChange = vi.fn()
    render(<FieldKeyInput value="" onChange={onChange} placeholder="フィールドキーを入力" />)
    expect(screen.getByPlaceholderText('フィールドキーを入力')).toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const onChange = vi.fn()
    render(<FieldKeyInput value="" onChange={onChange} className="my-class" />)
    const input = screen.getByRole('textbox')
    expect(input.classList.contains('my-class')).toBe(true)
  })

  it('does not render datalist when no schema fields exist', () => {
    const onChange = vi.fn()
    const { container } = render(<FieldKeyInput value="" onChange={onChange} />)
    expect(container.querySelector('datalist')).not.toBeInTheDocument()
  })

  it('renders datalist with options when schema fields are available', () => {
    useReportStore.getState().addSchemaGroup('master')
    const state = useReportStore.getState()
    const groupId = state.definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      key: 'order_id',
      label: '注文ID',
      type: 'string',
      required: true,
    })

    const onChange = vi.fn()
    const { container } = render(<FieldKeyInput value="" onChange={onChange} />)
    const datalist = container.querySelector('datalist')
    expect(datalist).toBeInTheDocument()
    expect(datalist?.querySelectorAll('option')).toHaveLength(1)
  })

  it('sets list attribute on input when schema fields exist', () => {
    useReportStore.getState().addSchemaGroup('master')
    const state = useReportStore.getState()
    const groupId = state.definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      key: 'amount',
      label: '金額',
      type: 'number',
      required: false,
    })

    const onChange = vi.fn()
    render(<FieldKeyInput value="" onChange={onChange} />)
    // When a datalist is attached, the input role becomes "combobox"
    const input = screen.getByRole('combobox') as HTMLInputElement
    expect(input.list).toBeTruthy()
  })
})
