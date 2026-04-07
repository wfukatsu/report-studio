import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConditionRow } from './ConditionRow'
import { useReportStore } from '@/store'
import type { DisplayCondition } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
})

const defaultCondition: DisplayCondition = {
  id: 'cond-1',
  fieldPath: 'customer.name',
  operator: 'equals',
  value: 'Alice',
}

const nullaryCondition: DisplayCondition = {
  id: 'cond-2',
  fieldPath: 'order.status',
  operator: 'empty',
}

describe('ConditionRow', () => {
  it('renders without crashing', () => {
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByRole('group', { name: '条件行' })).toBeInTheDocument()
  })

  it('renders a text input for fieldPath when no fieldOptions are provided', () => {
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByLabelText('フィールドパス')).toBeInTheDocument()
    expect(screen.getByDisplayValue('customer.name')).toBeInTheDocument()
  })

  it('renders a select for fieldPath when fieldOptions are provided', () => {
    const fieldOptions = [
      { value: 'customer.name', label: '顧客名' },
      { value: 'order.id', label: '注文ID' },
    ]
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={fieldOptions}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByLabelText('フィールド')).toBeInTheDocument()
  })

  it('renders the operator select', () => {
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByLabelText('演算子')).toBeInTheDocument()
  })

  it('shows value input for non-nullary operators', () => {
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByLabelText('比較値')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument()
  })

  it('hides value input for nullary operators (empty, not_empty)', () => {
    render(
      <ConditionRow
        condition={nullaryCondition}
        fieldOptions={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.queryByLabelText('比較値')).not.toBeInTheDocument()
  })

  it('calls onChange when fieldPath input changes', () => {
    const onChange = vi.fn()
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    const fieldInput = screen.getByLabelText('フィールドパス')
    fireEvent.change(fieldInput, { target: { value: 'order.total' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ fieldPath: 'order.total' })
    )
  })

  it('calls onRemove when delete button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={vi.fn()}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByLabelText('条件を削除'))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('calls onChange with nullary condition when operator changes to nullary', () => {
    const onChange = vi.fn()
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    const operatorSelect = screen.getByLabelText('演算子')
    fireEvent.change(operatorSelect, { target: { value: 'empty' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ operator: 'empty' })
    )
    // The updated condition should NOT have a value property
    const updated = onChange.mock.calls[0][0]
    expect('value' in updated).toBe(false)
  })

  it('calls onChange with valued condition when operator changes to valued', () => {
    const onChange = vi.fn()
    render(
      <ConditionRow
        condition={nullaryCondition}
        fieldOptions={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    const operatorSelect = screen.getByLabelText('演算子')
    fireEvent.change(operatorSelect, { target: { value: 'equals' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ operator: 'equals', value: '' })
    )
  })

  it('calls onChange when value input changes', () => {
    const onChange = vi.fn()
    render(
      <ConditionRow
        condition={defaultCondition}
        fieldOptions={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    const valueInput = screen.getByLabelText('比較値')
    fireEvent.change(valueInput, { target: { value: 'Bob' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'Bob' })
    )
  })
})
