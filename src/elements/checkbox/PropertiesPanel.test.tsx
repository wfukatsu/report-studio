import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckboxPropertiesPanel } from './PropertiesPanel'
import type { CheckboxElement } from '@/types'

function makeElement(overrides: Partial<CheckboxElement> = {}): CheckboxElement {
  return {
    id: 'cb-1',
    type: 'checkbox',
    position: { x: 0, y: 0 },
    size: { width: 5, height: 5 },
    zIndex: 1,
    visible: true,
    locked: false,
    checked: false,
    checkmark: '✓',
    label: '',
    ...overrides,
  } as CheckboxElement
}

describe('CheckboxPropertiesPanel — checked トグル', () => {
  it('checked トグルが onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<CheckboxPropertiesPanel el={makeElement({ checked: false })} onChange={onChange} />)
    const toggle = screen.getByRole('checkbox')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ checked: true })
  })

  it('checked: true のときチェックボックスが checked', () => {
    render(<CheckboxPropertiesPanel el={makeElement({ checked: true })} onChange={vi.fn()} />)
    const toggle = screen.getByRole('checkbox')
    expect(toggle).toBeChecked()
  })
})

describe('CheckboxPropertiesPanel — checkmark セレクタ', () => {
  it('checkmark 変更で onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<CheckboxPropertiesPanel el={makeElement()} onChange={onChange} />)
    const selects = screen.getAllByRole('combobox')
    // First combobox is checkmark, second is labelPosition
    fireEvent.change(selects[0], { target: { value: '×' } })
    expect(onChange).toHaveBeenCalledWith({ checkmark: '×' })
  })
})

describe('CheckboxPropertiesPanel — label 入力', () => {
  it('label テキスト入力が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<CheckboxPropertiesPanel el={makeElement()} onChange={onChange} />)
    const labelInput = screen.getByPlaceholderText('ラベルテキスト')
    fireEvent.change(labelInput, { target: { value: '対象' } })
    expect(onChange).toHaveBeenCalledWith({ label: '対象' })
  })
})

describe('CheckboxPropertiesPanel — dataSource 入力', () => {
  it('dataSource 入力が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<CheckboxPropertiesPanel el={makeElement()} onChange={onChange} />)
    const dsInput = screen.getByPlaceholderText('例: employee.checked')
    fireEvent.change(dsInput, { target: { value: 'flag' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: 'flag' })
  })

  it('dataSource 入力が空文字のとき undefined を渡す', () => {
    const onChange = vi.fn()
    render(<CheckboxPropertiesPanel el={makeElement({ dataSource: 'flag' })} onChange={onChange} />)
    const dsInput = screen.getByPlaceholderText('例: employee.checked')
    fireEvent.change(dsInput, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: undefined })
  })
})
