import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TokenInput } from './TokenInput'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('TokenInput', () => {
  it('renders a textarea without crashing', () => {
    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} placeholder="テキスト入力" />)
    expect(screen.getByPlaceholderText('テキスト入力')).toBeInTheDocument()
  })

  it('displays the current value', () => {
    const onChange = vi.fn()
    render(<TokenInput value="hello world" onChange={onChange} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('hello world')
  })

  it('calls onChange when user types', () => {
    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'new text' } })
    expect(onChange).toHaveBeenCalledWith('new text')
  })

  it('renders with custom rows prop', () => {
    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} rows={5} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.rows).toBe(5)
  })

  it('applies custom className when provided', () => {
    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} className="custom-class" />)
    const textarea = screen.getByRole('textbox')
    expect(textarea.classList.contains('custom-class')).toBe(true)
  })

  it('does not show dropdown when no schema fields are available', () => {
    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{{' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows dropdown with schema fields when {{ is typed', () => {
    // Set up schema with a field
    useReportStore.getState().addSchemaGroup('master')
    const state = useReportStore.getState()
    const groupId = state.definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      key: 'customer_name',
      label: '顧客名',
      type: 'string',
    })

    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{{' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('hides dropdown on Escape key', () => {
    // Set up schema with a field
    useReportStore.getState().addSchemaGroup('master')
    const state = useReportStore.getState()
    const groupId = state.definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      key: 'field_a',
      label: 'Field A',
      type: 'string',
    })

    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{{' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('inserts token on dropdown item mousedown', async () => {
    vi.useFakeTimers()
    // Set up schema with a field
    useReportStore.getState().addSchemaGroup('master')
    const state = useReportStore.getState()
    const groupId = state.definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      key: 'customer_name',
      label: '顧客名',
      type: 'string',
    })

    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')

    // Type {{ to show dropdown
    fireEvent.change(textarea, { target: { value: '{{' } })
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()

    // Click on a dropdown item (mousedown fires before blur)
    const item = screen.getByRole('option')
    fireEvent.mouseDown(item)

    // onChange should have been called with token inserted
    expect(onChange).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('hides dropdown after textarea blur with delay', () => {
    vi.useFakeTimers()
    useReportStore.getState().addSchemaGroup('master')
    const state = useReportStore.getState()
    const groupId = state.definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      key: 'field_b',
      label: 'Field B',
      type: 'string',
    })

    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{{' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Blur textarea
    fireEvent.blur(textarea)

    // Dropdown is still visible immediately (150ms delay)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // After 150ms, dropdown should hide
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('TokenInput — uncovered branch coverage', () => {
  beforeEach(() => {
    useReportStore.getState().newReport()
  })

  it('hides dropdown when text does not contain {{ trigger', () => {
    // Seed schema so dropdown CAN appear
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: 'Name', type: 'string' })

    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')

    // Type {{ to open dropdown
    fireEvent.change(textarea, { target: { value: '{{' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Type something without {{ to close dropdown
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('filters options by query after {{ trigger', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'firstName', label: 'First Name', type: 'string' })
    useReportStore.getState().addSchemaField(groupId, { key: 'lastName', label: 'Last Name', type: 'string' })

    render(<TokenInput value="" onChange={vi.fn()} />)
    const textarea = screen.getByRole('textbox')

    // Type {{first to filter
    fireEvent.change(textarea, { target: { value: '{{first' } })
    // Only firstName should show (filter branch: filter is truthy → filter applied)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    const items = screen.getAllByRole('option')
    expect(items.length).toBe(1) // only firstName matches
    expect(items[0]).toHaveTextContent('firstName')
  })
})
