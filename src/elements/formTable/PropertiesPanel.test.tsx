import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormTablePropertiesPanel } from './PropertiesPanel'
import { createFormTableElement } from '@/lib/elementFactories'
import type { FormTableElement } from '@/types'

function makeElement(overrides: Partial<FormTableElement> = {}): FormTableElement {
  return createFormTableElement(overrides) as FormTableElement
}

describe('FormTablePropertiesPanel — 列定義', () => {
  it('renders column count matching element', () => {
    const el = makeElement()
    render(<FormTablePropertiesPanel el={el} onChange={vi.fn()} />)
    // Default factory has 3 columns → 3 delete buttons
    const deleteButtons = screen.getAllByText('削除')
    expect(deleteButtons.length).toBeGreaterThanOrEqual(el.columns.length)
  })

  it('calls onChange with new column added when + button clicked', () => {
    const el = makeElement()
    const onChange = vi.fn()
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    const addColBtn = screen.getByText(/列を追加/)
    fireEvent.click(addColBtn)
    expect(onChange).toHaveBeenCalledOnce()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.columns).toHaveLength(el.columns.length + 1)
    // Rows must also have a new cell appended
    expect(patch.rows).toBeDefined()
    patch.rows!.forEach((row) => {
      expect(row.cells).toHaveLength(el.columns.length + 1)
    })
  })

  it('calls onChange with column removed when delete clicked', () => {
    const el = makeElement()
    const onChange = vi.fn()
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    // Click the first column delete button
    const deleteButtons = screen.getAllByTitle(/列.*削除/)
    fireEvent.click(deleteButtons[0])
    expect(onChange).toHaveBeenCalledOnce()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.columns).toHaveLength(el.columns.length - 1)
    // Rows must also have the cell removed
    patch.rows!.forEach((row) => {
      expect(row.cells).toHaveLength(el.columns.length - 1)
    })
  })
})

describe('FormTablePropertiesPanel — 行定義', () => {
  it('calls onChange with new row added when + 行を追加 clicked', () => {
    const el = makeElement()
    const onChange = vi.fn()
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    const addRowBtn = screen.getByText(/行を追加/)
    fireEvent.click(addRowBtn)
    expect(onChange).toHaveBeenCalledOnce()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.rows).toHaveLength(el.rows.length + 1)
    // New row has same number of cells as columns
    const newRow = patch.rows![patch.rows!.length - 1]
    expect(newRow.cells).toHaveLength(el.columns.length)
  })

  it('calls onChange with row removed when row delete clicked', () => {
    const el = makeElement()
    const onChange = vi.fn()
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    const deleteButtons = screen.getAllByTitle(/行.*削除/)
    fireEvent.click(deleteButtons[0])
    expect(onChange).toHaveBeenCalledOnce()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.rows).toHaveLength(el.rows.length - 1)
  })
})

describe('FormTablePropertiesPanel — セル編集', () => {
  it('input セルのプレースホルダー変更が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    // Default body row has input cells
    render(<FormTablePropertiesPanel el={makeElement()} onChange={onChange} />)
    const placeholderInputs = screen.getAllByPlaceholderText('プレースホルダー')
    fireEvent.change(placeholderInputs[0], { target: { value: '名前を入力' } })
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.rows).toBeDefined()
  })

  it('dataField セルの fieldKey 変更が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    const el = makeElement({
      rows: [{
        id: 'r1', role: 'body' as const, height: 8,
        cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: '' }],
      }],
    })
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    const fieldKeyInput = screen.getByPlaceholderText('field.key')
    fireEvent.change(fieldKeyInput, { target: { value: 'customer.name' } })
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.rows?.[0]?.cells?.[0]).toMatchObject({ fieldKey: 'customer.name' })
  })

  it('行の高さ変更が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    // Single-row element to make it easy to find the height input
    const el = makeElement({
      rows: [{ id: 'r1', role: 'header' as const, height: 8, cells: [] }],
    })
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    const heightInput = screen.getByDisplayValue('8')
    fireEvent.change(heightInput, { target: { value: '12' } })
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.rows?.[0]?.height).toBe(12)
  })
})

describe('FormTablePropertiesPanel — 列幅変更', () => {
  it('列幅変更が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    const el = makeElement({
      columns: [{ id: 'col1', width: 40, align: 'left' }],
      rows: [],
    })
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    const widthInput = screen.getByDisplayValue('40')
    fireEvent.change(widthInput, { target: { value: '60' } })
    expect(onChange).toHaveBeenCalled()
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.columns?.[0]?.width).toBe(60)
  })
})

describe('FormTablePropertiesPanel — セル種別変更', () => {
  it('セル種別を label→input に変更すると onChange が呼ばれる', () => {
    const onChange = vi.fn()
    const el = makeElement({
      rows: [{
        id: 'r1', role: 'header' as const, height: 8,
        cells: [{ id: 'c1', type: 'label' as const, text: '' }],
      }],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    render(<FormTablePropertiesPanel el={el} onChange={onChange} />)
    // The cell type select shows 'ラベル（固定テキスト）' — change it to 'input'
    const typeSelect = screen.getByDisplayValue('ラベル（固定テキスト）')
    fireEvent.change(typeSelect, { target: { value: 'input' } })
    expect(onChange).toHaveBeenCalled()
  })
})

describe('FormTablePropertiesPanel — 外観設定', () => {
  it('renders border color input', () => {
    render(<FormTablePropertiesPanel el={makeElement()} onChange={vi.fn()} />)
    expect(screen.getByText('枠線色')).toBeInTheDocument()
  })

  it('renders data source input', () => {
    render(<FormTablePropertiesPanel el={makeElement()} onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/items/)).toBeInTheDocument()
  })

  it('calls onChange when dataSource changed', () => {
    const onChange = vi.fn()
    render(<FormTablePropertiesPanel el={makeElement()} onChange={onChange} />)
    const input = screen.getByPlaceholderText(/items/)
    fireEvent.change(input, { target: { value: 'products' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: 'products' })
  })

  it('clears dataSource when empty string entered (→ undefined)', () => {
    const onChange = vi.fn()
    render(<FormTablePropertiesPanel el={makeElement({ dataSource: 'items' })} onChange={onChange} />)
    const input = screen.getByPlaceholderText(/items/)
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: undefined })
  })
})
