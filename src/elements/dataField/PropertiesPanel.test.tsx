import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataFieldPropertiesPanel } from './PropertiesPanel'
import type { DataFieldElement } from '@/types'

function makeEl(overrides?: Partial<DataFieldElement>): DataFieldElement {
  return {
    id: 'df-1', type: 'dataField',
    position: { x: 0, y: 0 }, size: { width: 50, height: 8 },
    zIndex: 1, visible: true, locked: false,
    fieldKey: 'customer.name',
    style: { fontSize: 3.5, textAlign: 'left', fontWeight: 'normal', color: '#000' },
    ...overrides,
  }
}

describe('DataFieldPropertiesPanel', () => {
  it('renders without error', () => {
    render(<DataFieldPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('表示設定')).toBeInTheDocument()
  })

  it('calls onChange when label input changes', () => {
    const onChange = vi.fn()
    render(<DataFieldPropertiesPanel el={makeEl({ label: '' })} onChange={onChange} />)
    const input = screen.getByPlaceholderText('未入力時のラベル')
    fireEvent.change(input, { target: { value: '顧客名' } })
    expect(onChange).toHaveBeenCalledWith({ label: '顧客名' })
  })

  it('calls onChange when fallbackText input changes', () => {
    const onChange = vi.fn()
    render(<DataFieldPropertiesPanel el={makeEl()} onChange={onChange} />)
    const input = screen.getByPlaceholderText('データなし時に表示するテキスト')
    fireEvent.change(input, { target: { value: '—' } })
    expect(onChange).toHaveBeenCalledWith({ fallbackText: '—' })
  })
})
