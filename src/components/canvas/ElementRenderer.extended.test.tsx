/**
 * Extended ElementRenderer tests — covers additional element types to improve function coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ElementRenderer } from './ElementRenderer'
import {
  createTextElement,
  createLabelElement,
  createShapeElement,
  createImageElement,
  createTableElement,
  createChartElement,
  createDataFieldElement,
  createBarcodeElement,
  createBarcodeCode128Element,
  createManualEntryField,
  createHankoElement,
  createApprovalStampRowElement,
  createRevenueStampElement,
  createRepeatingBandElement,
  createRepeatingListElement,
} from '@/lib/elementFactories'
import type { ReportElement } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().invalidateComputed()
})

// ---------------------------------------------------------------------------
// Label element
// ---------------------------------------------------------------------------

describe('ElementRenderer — label', () => {
  it('renders label element', () => {
    const el = createLabelElement({ id: 'label-1' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Shape element
// ---------------------------------------------------------------------------

describe('ElementRenderer — shape', () => {
  it('renders rectangle shape', () => {
    const el = createShapeElement({ id: 'shape-1', shape: 'rectangle' }) as ReportElement
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders circle shape', () => {
    const el = createShapeElement({ id: 'shape-2', shape: 'circle' }) as ReportElement
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders line shape', () => {
    const el = createShapeElement({ id: 'shape-3', shape: 'line' }) as ReportElement
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Image element
// ---------------------------------------------------------------------------

describe('ElementRenderer — image', () => {
  it('renders image placeholder when src is empty', () => {
    const el = createImageElement({ id: 'image-1', src: '' })
    render(<ElementRenderer element={el} />)
    expect(screen.getByText(/画像/)).toBeInTheDocument()
  })

  it('renders image with valid src', () => {
    const el = createImageElement({ id: 'image-2', src: 'data:image/png;base64,abc' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.querySelector('img')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// DataField element
// ---------------------------------------------------------------------------

describe('ElementRenderer — dataField', () => {
  it('renders dataField element', () => {
    const el = createDataFieldElement({ id: 'df-1', fieldKey: 'customer.name' })
    const { container } = render(<ElementRenderer element={el} data={{ customer: { name: 'テスト' } }} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Table element
// ---------------------------------------------------------------------------

describe('ElementRenderer — table', () => {
  it('renders table element', () => {
    const el = createTableElement({ id: 'table-1' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Chart element
// ---------------------------------------------------------------------------

describe('ElementRenderer — chart', () => {
  it('renders bar chart element', () => {
    const el = createChartElement({ id: 'chart-1', chartType: 'bar' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Barcode element
// ---------------------------------------------------------------------------

describe('ElementRenderer — barcode', () => {
  it('renders QR code barcode', () => {
    const el = createBarcodeElement({ id: 'barcode-1', kind: 'qr', value: 'https://example.com' })
    const { container } = render(<ElementRenderer element={el} data={{}} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders Code128 barcode', () => {
    const el = createBarcodeCode128Element({ id: 'barcode-2' })
    const { container } = render(<ElementRenderer element={el} data={{}} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders fallback for unsupported barcode kind', () => {
    const el = createBarcodeElement({ id: 'barcode-3', kind: 'jan13' as never })
    render(<ElementRenderer element={el} data={{}} />)
    expect(screen.getByText('[jan13]')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ManualEntry element
// ---------------------------------------------------------------------------

describe('ElementRenderer — manualEntry', () => {
  it('renders manual entry element', () => {
    const el = createManualEntryField({ id: 'manual-1' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Hanko element
// ---------------------------------------------------------------------------

describe('ElementRenderer — hanko', () => {
  it('renders hanko element', () => {
    const el = createHankoElement({ id: 'hanko-1' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ApprovalStampRow element
// ---------------------------------------------------------------------------

describe('ElementRenderer — approvalStampRow', () => {
  it('renders approval stamp row element', () => {
    const el = createApprovalStampRowElement({ id: 'approval-1' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// RevenueStamp element
// ---------------------------------------------------------------------------

describe('ElementRenderer — revenueStamp', () => {
  it('renders revenue stamp element', () => {
    const el = createRevenueStampElement({ id: 'revenue-1' })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// RepeatingBand element
// ---------------------------------------------------------------------------

describe('ElementRenderer — repeatingBand', () => {
  it('renders repeating band without data', () => {
    const el = createRepeatingBandElement({ id: 'band-1' })
    const { container } = render(<ElementRenderer element={el} data={{}} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders repeating band with matching data', () => {
    const el = createRepeatingBandElement({ id: 'band-2', dataSource: 'items' })
    const data = {
      items: [
        { no: 1, name: '商品A', quantity: 2, unit: '個', unitPrice: 1000, amount: 2000 },
      ],
    }
    const { container } = render(<ElementRenderer element={el} data={data} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// RepeatingList element
// ---------------------------------------------------------------------------

describe('ElementRenderer — repeatingList', () => {
  it('renders repeating list without data', () => {
    const el = createRepeatingListElement({ id: 'list-1' })
    const { container } = render(<ElementRenderer element={el} data={{}} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders repeating list with matching data', () => {
    const el = createRepeatingListElement({ id: 'list-2', dataSource: 'members' })
    const data = {
      members: [
        { name: '山田太郎', title: '部長', dept: '営業部' },
      ],
    }
    const { container } = render(<ElementRenderer element={el} data={data} />)
    expect(container.firstChild).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Visibility and conditional display
// ---------------------------------------------------------------------------

describe('ElementRenderer — visibility', () => {
  it('returns null for invisible element', () => {
    const el = createTextElement({ id: 'text-invisible', visible: false })
    const { container } = render(<ElementRenderer element={el} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders visible element normally', () => {
    const el = createTextElement({ id: 'text-visible', visible: true, content: 'Visible' })
    render(<ElementRenderer element={el} />)
    expect(screen.getByText('Visible')).toBeInTheDocument()
  })

  it('returns null when conditionalDisplay evaluates to false', () => {
    const el = createTextElement({
      id: 'text-cond',
      visible: true,
      content: 'Conditional',
      conditionalDisplay: {
        logic: 'and',
        conditions: [
          { id: 'c1', fieldPath: 'status', operator: 'equals', value: 'active' },
        ],
      },
    })
    // status is not 'active' so element should be hidden
    const { container } = render(<ElementRenderer element={el} data={{ status: 'inactive' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when conditionalDisplay evaluates to true', () => {
    const el = createTextElement({
      id: 'text-cond-visible',
      visible: true,
      content: '表示中',
      conditionalDisplay: {
        logic: 'and',
        conditions: [
          { id: 'c1', fieldPath: 'status', operator: 'equals', value: 'active' },
        ],
      },
    })
    render(<ElementRenderer element={el} data={{ status: 'active' }} />)
    expect(screen.getByText('表示中')).toBeInTheDocument()
  })
})
