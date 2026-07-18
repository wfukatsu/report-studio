/**
 * Extended ElementRenderer tests — covers additional element types to improve function coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ElementRenderer } from './ElementRenderer'
import {
  createTextElement,
  createShapeElement,
  createImageElement,
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
  createFormTableElement,
} from '@/lib/elementFactories'
import type { ReportElement } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().invalidateComputed()
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

  it('renders jan13 (EAN-13) barcode', () => {
    const el = createBarcodeElement({ id: 'barcode-3', kind: 'jan13' as never, value: '4902778913406' })
    const { container } = render(<ElementRenderer element={el} data={{}} />)
    expect(container.firstChild).not.toBeNull()
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
    const el = createRepeatingBandElement({
      id: 'band-2',
      dataSource: 'items',
      fields: [
        { key: 'no', label: 'No.', width: 12, align: 'center' },
        { key: 'name', label: '品目', width: 55, align: 'left' },
      ],
    } as Partial<ReportElement>)
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
// FormTable element — readonly gate parity with repeatingBand / repeatingList
// ---------------------------------------------------------------------------

describe('ElementRenderer — formTable readonly gate', () => {
  const data = { items: [{ itemName: '商品A', amount: 2000 }] }

  it('shows the design-preview badge in editor mode even when data is bound (readonly=false)', () => {
    const el = createFormTableElement({ id: 'ft-design', dataSource: 'items' } as Partial<ReportElement>)
    render(<ElementRenderer element={el} data={data} readonly={false} />)
    // Design preview renders the "帳票テーブル · <dataSource>" hint badge
    expect(screen.getByText('帳票テーブル · items')).toBeInTheDocument()
  })

  it('renders live rows (no design badge) in preview mode (readonly=true)', () => {
    const el = createFormTableElement({ id: 'ft-live', dataSource: 'items' } as Partial<ReportElement>)
    const { container } = render(<ElementRenderer element={el} data={data} readonly={true} />)
    expect(container.querySelector('*')).not.toBeNull()
    expect(screen.queryByText('帳票テーブル · items')).toBeNull()
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

// ---------------------------------------------------------------------------
// Preview mode: hide empty-data elements when readonly=true
// ---------------------------------------------------------------------------

describe('ElementRenderer — preview mode (readonly=true): hide empty data elements', () => {
  it('hides dataField element when field resolves to empty (readonly=true)', () => {
    const el = createDataFieldElement({ id: 'df-empty', fieldKey: 'missing_field' })
    const { container } = render(<ElementRenderer element={el} data={{}} readonly={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows dataField element when field has data (readonly=true)', () => {
    const el = createDataFieldElement({ id: 'df-filled', fieldKey: 'customer_name' })
    render(<ElementRenderer element={el} data={{ customer_name: '田中太郎' }} readonly={true} />)
    // DataFieldRenderer renders the value
    expect(screen.getByText('田中太郎')).toBeInTheDocument()
  })

  it('shows dataField element when readonly=false even if field is empty', () => {
    const el = createDataFieldElement({ id: 'df-editor', fieldKey: 'missing_field' })
    const { container } = render(<ElementRenderer element={el} data={{}} readonly={false} />)
    // In editor mode, the fallback placeholder is shown
    expect(container.firstChild).not.toBeNull()
  })

  it('hides text element with {{}} when data resolves to empty (readonly=true)', () => {
    const el = createTextElement({ id: 'text-empty', content: '{{customer_name}}' })
    const { container } = render(<ElementRenderer element={el} data={{}} readonly={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows text element with {{}} when data is present (readonly=true)', () => {
    const el = createTextElement({ id: 'text-filled', content: '{{customer_name}}' })
    render(<ElementRenderer element={el} data={{ customer_name: '田中' }} readonly={true} />)
    expect(screen.getByText('田中')).toBeInTheDocument()
  })

  it('shows static text element without {{}} regardless of data (readonly=true)', () => {
    const el = createTextElement({ id: 'text-static', content: '固定テキスト' })
    render(<ElementRenderer element={el} data={{}} readonly={true} />)
    expect(screen.getByText('固定テキスト')).toBeInTheDocument()
  })

  it('hides repeatingBand when data array is empty (readonly=true)', () => {
    const el = createRepeatingBandElement({ id: 'band-empty', dataSource: 'items' })
    const { container } = render(<ElementRenderer element={el} data={{ items: [] }} readonly={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows repeatingBand when data array has items (readonly=true)', () => {
    const el = createRepeatingBandElement({ id: 'band-filled', dataSource: 'items' })
    const { container } = render(
      <ElementRenderer element={el} data={{ items: [{ id: 1, name: 'A', amount: 100 }] }} readonly={true} />,
    )
    expect(container.firstChild).not.toBeNull()
  })

  it('hides chart when dataBinding array is empty (readonly=true)', () => {
    const el = createChartElement({ id: 'chart-empty', dataBinding: 'chartData' })
    const { container } = render(<ElementRenderer element={el} data={{ chartData: [] }} readonly={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows shape element regardless of data (readonly=true, static element)', () => {
    const el = createShapeElement({ id: 'shape-1' })
    const { container } = render(<ElementRenderer element={el} data={{}} readonly={true} />)
    expect(container.firstChild).not.toBeNull()
  })
})
