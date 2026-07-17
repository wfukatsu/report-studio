import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RepeatingListPropertiesPanel } from './PropertiesPanel'
import type { RepeatingListElement } from '@/types'

function makeEl(overrides?: Partial<RepeatingListElement>): RepeatingListElement {
  return {
    id: 'rl-1', type: 'repeatingList',
    position: { x: 0, y: 0 }, size: { width: 120, height: 80 },
    zIndex: 1, visible: true, locked: false,
    dataSource: 'items',
    layout: 'vertical',
    gridColumns: 2,
    itemWidth: 50,
    itemHeight: 30,
    gap: 2,
    fields: [],
    maxItems: 0,
    pageBreak: 'none',
    ...overrides,
  }
}

describe('RepeatingListPropertiesPanel', () => {
  it('renders without error', () => {
    render(<RepeatingListPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('繰り返しリスト — データ')).toBeInTheDocument()
  })

  it('shows layout selector', () => {
    render(<RepeatingListPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('縦並び (リスト形式)')).toBeInTheDocument()
  })

  it('calls onChange when layout changes', () => {
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('縦並び (リスト形式)'), { target: { value: 'grid' } })
    expect(onChange).toHaveBeenCalledWith({ layout: 'grid' })
  })

  it('shows grid columns input only for grid layout', () => {
    render(<RepeatingListPropertiesPanel el={makeEl({ layout: 'grid' })} onChange={vi.fn()} />)
    expect(screen.getByText('グリッド列数')).toBeInTheDocument()
  })

  it('hides grid columns for non-grid layout', () => {
    render(<RepeatingListPropertiesPanel el={makeEl({ layout: 'vertical' })} onChange={vi.fn()} />)
    expect(screen.queryByText('グリッド列数')).not.toBeInTheDocument()
  })

  it('calls onChange for all numeric inputs', () => {
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={makeEl({ layout: 'grid' })} onChange={onChange} />)
    // アイテム幅
    const numInputs = screen.getAllByRole('spinbutton')
    // Trigger each numeric input
    numInputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '10' } })
    })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when dataSource changes', () => {
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText('例: employees, products'), { target: { value: 'products' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: 'products' })
  })

  it('renders field with isLabel=false as フィールド', () => {
    render(
      <RepeatingListPropertiesPanel
        el={makeEl({ fields: [{ key: 'name', x: 0, y: 0, width: 30, height: 8 }] })}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('フィールド 1')).toBeInTheDocument()
  })

  it('renders field with isLabel=true as ラベル', () => {
    render(
      <RepeatingListPropertiesPanel
        el={makeEl({ fields: [{ key: '氏名', isLabel: true, x: 0, y: 0, width: 30, height: 8 }] })}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('ラベル 1')).toBeInTheDocument()
  })

  it('calls onChange when field delete button is clicked', () => {
    const onChange = vi.fn()
    render(
      <RepeatingListPropertiesPanel
        el={makeEl({ fields: [{ key: 'name', x: 0, y: 0, width: 30, height: 8 }] })}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByText('削除'))
    expect(onChange).toHaveBeenCalledWith({ fields: [] })
  })

  it('calls onChange when isLabel checkbox is toggled on a field', () => {
    const onChange = vi.fn()
    render(
      <RepeatingListPropertiesPanel
        el={makeEl({ fields: [{ key: 'name', x: 0, y: 0, width: 30, height: 8 }] })}
        onChange={onChange}
      />,
    )
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalled()
  })

  it('shows add field button', () => {
    render(<RepeatingListPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText(/フィールドを追加|追加/)).toBeInTheDocument()
  })

  it('calls onChange when add field button is clicked', () => {
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.click(screen.getByText(/フィールドを追加|追加/))
    expect(onChange).toHaveBeenCalled()
  })
})
