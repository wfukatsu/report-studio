import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ManualEntryPropertiesPanel } from './PropertiesPanel'
import type { ManualEntryField } from '@/types'

function makeElement(overrides: Partial<ManualEntryField> = {}): ManualEntryField {
  return {
    id: 'me-1',
    type: 'manualEntry',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    label: '記入欄',
    labelPosition: 'top',
    displayMode: 'line',
    lineColor: '#000000',
    style: { fontSize: 3.5, color: '#000000' },
    ...overrides,
  } as ManualEntryField
}

describe('ManualEntryPropertiesPanel — furiganaEnabled', () => {
  it('furiganaEnabled チェックボックスが onChange を呼ぶ (false → true)', () => {
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={makeElement({ furiganaEnabled: false })} onChange={onChange} />)
    const toggle = screen.getByRole('checkbox', { name: 'フリガナ欄を表示' })
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ furiganaEnabled: true })
  })

  it('furiganaEnabled: true のときチェックボックスが checked', () => {
    render(<ManualEntryPropertiesPanel el={makeElement({ furiganaEnabled: true })} onChange={vi.fn()} />)
    const toggle = screen.getByRole('checkbox', { name: 'フリガナ欄を表示' })
    expect(toggle).toBeChecked()
  })

  it('furiganaEnabled: false のとき furiganaDataSource コントロールが非表示', () => {
    render(<ManualEntryPropertiesPanel el={makeElement({ furiganaEnabled: false })} onChange={vi.fn()} />)
    expect(screen.queryByPlaceholderText('例: employee.furigana')).not.toBeInTheDocument()
  })

  it('furiganaEnabled: true のとき furiganaDataSource コントロールが表示される', () => {
    render(<ManualEntryPropertiesPanel el={makeElement({ furiganaEnabled: true })} onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('例: employee.furigana')).toBeInTheDocument()
  })
})

describe('ManualEntryPropertiesPanel — furiganaDataSource', () => {
  it('furiganaDataSource 入力が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={makeElement({ furiganaEnabled: true })} onChange={onChange} />)
    const input = screen.getByPlaceholderText('例: employee.furigana')
    fireEvent.change(input, { target: { value: 'person.furigana' } })
    expect(onChange).toHaveBeenCalledWith({ furiganaDataSource: 'person.furigana' })
  })

  it('furiganaDataSource が空文字のとき undefined を渡す', () => {
    const onChange = vi.fn()
    render(
      <ManualEntryPropertiesPanel
        el={makeElement({ furiganaEnabled: true, furiganaDataSource: 'person.furigana' })}
        onChange={onChange}
      />,
    )
    const input = screen.getByPlaceholderText('例: employee.furigana')
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ furiganaDataSource: undefined })
  })
})

describe('ManualEntryPropertiesPanel — furiganaRatio', () => {
  it('furiganaRatio の NumInput が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={makeElement({ furiganaEnabled: true })} onChange={onChange} />)
    // NumInput renders as a number input; find it by its role and current value
    const inputs = screen.getAllByRole('spinbutton')
    // furiganaRatio input should be one of the spinbuttons
    // Change its value
    fireEvent.change(inputs[inputs.length - 1], { target: { value: '0.4' } })
    expect(onChange).toHaveBeenCalledWith({ furiganaRatio: 0.4 })
  })
})
