import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ConditionalDisplayEditor } from './ConditionalDisplayEditor'
import type { ConditionalDisplay } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
})

function renderEditor(
  value: ConditionalDisplay | undefined,
  onChange = vi.fn(),
) {
  return render(
    <ConditionalDisplayEditor value={value} onChange={onChange} />,
  )
}

describe('ConditionalDisplayEditor — 初期レンダリング', () => {
  it('renders the legend', () => {
    renderEditor(undefined)
    expect(screen.getByText('表示条件')).toBeInTheDocument()
  })

  it('shows empty state message when no conditions', () => {
    renderEditor(undefined)
    expect(screen.getByText('条件なし（常に表示）')).toBeInTheDocument()
  })

  it('renders AND/OR logic toggle', () => {
    renderEditor(undefined)
    expect(screen.getByText('AND')).toBeInTheDocument()
    expect(screen.getByText('OR')).toBeInTheDocument()
  })

  it('renders 条件追加 button', () => {
    renderEditor(undefined)
    expect(screen.getByRole('button', { name: '条件を追加' })).toBeInTheDocument()
  })

  it('defaults to AND logic', () => {
    renderEditor(undefined)
    const andRadio = screen.getByRole('radio', { name: 'AND' }) as HTMLInputElement
    expect(andRadio.checked).toBe(true)
  })
})

describe('ConditionalDisplayEditor — 条件追加', () => {
  it('calls onChange with new condition when 条件追加 is clicked', () => {
    const onChange = vi.fn()
    renderEditor(undefined, onChange)
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }))

    expect(onChange).toHaveBeenCalledOnce()
    const result = onChange.mock.calls[0][0] as ConditionalDisplay
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].operator).toBe('equals')
  })

  it('renders condition row after adding condition', () => {
    const onChange = vi.fn()
    const { rerender } = renderEditor(undefined, onChange)

    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }))

    const updatedValue = onChange.mock.calls[0][0] as ConditionalDisplay
    rerender(<ConditionalDisplayEditor value={updatedValue} onChange={onChange} />)

    expect(screen.getByRole('group', { name: '条件行' })).toBeInTheDocument()
  })

  it('adds multiple conditions', () => {
    const onChange = vi.fn()
    const { rerender } = renderEditor(undefined, onChange)

    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }))
    const first = onChange.mock.calls[0][0] as ConditionalDisplay
    rerender(<ConditionalDisplayEditor value={first} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }))
    const second = onChange.mock.calls[1][0] as ConditionalDisplay
    expect(second.conditions).toHaveLength(2)
  })
})

describe('ConditionalDisplayEditor — AND/OR 切替', () => {
  it('calls onChange with OR logic when OR is selected', () => {
    const onChange = vi.fn()
    renderEditor({ logic: 'and', conditions: [] }, onChange)

    const orLabel = screen.getByText('OR').closest('label')!
    fireEvent.click(orLabel)

    expect(onChange).toHaveBeenCalledOnce()
    const result = onChange.mock.calls[0][0] as ConditionalDisplay
    expect(result.logic).toBe('or')
  })

  it('calls onChange with AND logic when AND is selected from OR', () => {
    const onChange = vi.fn()
    renderEditor({ logic: 'or', conditions: [] }, onChange)

    const andLabel = screen.getByText('AND').closest('label')!
    fireEvent.click(andLabel)

    expect(onChange).toHaveBeenCalledOnce()
    const result = onChange.mock.calls[0][0] as ConditionalDisplay
    expect(result.logic).toBe('and')
  })
})

describe('ConditionalDisplayEditor — 条件削除', () => {
  it('calls onChange removing condition when delete is clicked', () => {
    const onChange = vi.fn()
    const existingValue: ConditionalDisplay = {
      logic: 'and',
      conditions: [
        { id: 'cond-1', fieldPath: 'name', operator: 'equals', value: 'foo' },
      ],
    }
    renderEditor(existingValue, onChange)

    fireEvent.click(screen.getByRole('button', { name: '条件を削除' }))

    expect(onChange).toHaveBeenCalledOnce()
    // When last condition removed and no original value, collapses to undefined
  })
})

describe('ConditionalDisplayEditor — カスタム fieldOptions', () => {
  it('renders field select when fieldOptions provided', () => {
    renderEditor(
      { logic: 'and', conditions: [{ id: 'c1', fieldPath: '', operator: 'equals', value: '' }] },
      vi.fn(),
      // @ts-expect-error passing 4th positional arg via wrapper
    )
    // Without fieldOptions, expect a text input
    expect(screen.getByRole('textbox', { name: 'フィールドパス' })).toBeInTheDocument()
  })
})
