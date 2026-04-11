import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BarcodePropertiesPanel } from './PropertiesPanel'
import type { BarcodeElement } from '@/types'

function makeEl(overrides?: Partial<BarcodeElement>): BarcodeElement {
  return {
    id: 'b-1', type: 'barcode',
    position: { x: 0, y: 0 }, size: { width: 40, height: 40 },
    zIndex: 1, visible: true, locked: false,
    kind: 'qr', value: 'https://example.com',
    ...overrides,
  }
}

describe('BarcodePropertiesPanel', () => {
  it('renders without error', () => {
    render(<BarcodePropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('バーコード')).toBeInTheDocument()
  })

  it('shows kind selector with QR selected', () => {
    render(<BarcodePropertiesPanel el={makeEl({ kind: 'qr' })} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('QRコード')).toBeInTheDocument()
  })

  it('calls onChange when kind changes', () => {
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('QRコード'), { target: { value: 'code128' } })
    expect(onChange).toHaveBeenCalledWith({ kind: 'code128' })
  })

  it('shows error correction only for QR', () => {
    render(<BarcodePropertiesPanel el={makeEl({ kind: 'qr' })} onChange={vi.fn()} />)
    expect(screen.getByText('誤り訂正レベル')).toBeInTheDocument()
  })

  it('hides error correction for non-QR codes', () => {
    render(<BarcodePropertiesPanel el={makeEl({ kind: 'code128' })} onChange={vi.fn()} />)
    expect(screen.queryByText('誤り訂正レベル')).not.toBeInTheDocument()
  })

  it('calls onChange when value input changes', () => {
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={makeEl({ value: 'test' })} onChange={onChange} />)
    const input = screen.getByDisplayValue('test')
    fireEvent.change(input, { target: { value: 'new-value' } })
    expect(onChange).toHaveBeenCalledWith({ value: 'new-value' })
  })

  it('calls onChange when showText checkbox changes', () => {
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={makeEl({ showText: true })} onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith({ showText: false })
  })
})
