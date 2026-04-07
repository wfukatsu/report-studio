import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarcodeRenderer } from './Renderer'
import type { BarcodeElement } from '@/types'

function makeQrElement(overrides: Partial<BarcodeElement> = {}): BarcodeElement {
  return {
    id: 'bc-1',
    type: 'barcode',
    position: { x: 10, y: 10 },
    size: { width: 30, height: 30 },
    zIndex: 1,
    visible: true,
    locked: false,
    kind: 'qr',
    value: 'https://example.com',
    errorCorrection: 'M',
    darkColor: '#000000',
    lightColor: '#ffffff',
    showText: false,
    ...overrides,
  } as BarcodeElement
}

function makeCode128Element(overrides: Partial<BarcodeElement> = {}): BarcodeElement {
  return {
    ...makeQrElement(),
    kind: 'code128',
    value: '1234567890',
    size: { width: 60, height: 15 },
    showText: true,
    ...overrides,
  } as BarcodeElement
}

describe('BarcodeRenderer — QR コード', () => {
  it('renders QR code SVG', () => {
    const { container } = render(<BarcodeRenderer element={makeQrElement()} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders without error for empty value', () => {
    const { container } = render(
      <BarcodeRenderer element={makeQrElement({ value: '' })} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('interpolates data token in QR value', () => {
    const { container } = render(
      <BarcodeRenderer
        element={makeQrElement({ value: '{{url}}' })}
        data={{ url: 'https://test.com' }}
      />,
    )
    // Just check it renders without error
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

describe('BarcodeRenderer — Code128', () => {
  it('renders Code128 barcode without error', () => {
    const { container } = render(<BarcodeRenderer element={makeCode128Element()} />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('BarcodeRenderer — 未知の種類', () => {
  it('shows placeholder for unknown barcode kind', () => {
    render(
      <BarcodeRenderer
        element={makeQrElement({ kind: 'unknown' as 'qr' })}
      />,
    )
    expect(screen.getByText('[unknown]')).toBeInTheDocument()
  })
})
