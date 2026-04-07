import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RepeatingBandRenderer } from './Renderer'
import { createRepeatingBandElement } from '@/lib/elementFactories'
import type { RepeatingBandElement } from '@/types'

function makeElement(overrides: Partial<RepeatingBandElement> = {}): RepeatingBandElement {
  return createRepeatingBandElement(overrides) as RepeatingBandElement
}

describe('RepeatingBandRenderer — デザインプレビュー (records=undefined)', () => {
  it('renders design preview without error', () => {
    const { container } = render(<RepeatingBandRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows data source badge', () => {
    render(<RepeatingBandRenderer element={makeElement({ dataSource: 'items' })} />)
    expect(screen.getByText(/繰り返しバンド/)).toBeInTheDocument()
    expect(screen.getByText(/items/)).toBeInTheDocument()
  })

  it('shows column headers when showHeader is true', () => {
    const el = makeElement({ showHeader: true })
    render(<RepeatingBandRenderer element={el} />)
    // First field label from DEFAULT_BAND_FIELDS is 'No.'
    expect(screen.getByText('No.')).toBeInTheDocument()
  })

  it('shows max items text when maxItems > 0', () => {
    render(<RepeatingBandRenderer element={makeElement({ maxItems: 10 })} />)
    expect(screen.getByText(/最大 10 件/)).toBeInTheDocument()
  })

  it('shows unlimited records text when maxItems is 0', () => {
    render(<RepeatingBandRenderer element={makeElement({ maxItems: 0 })} />)
    expect(screen.getByText(/レコード数分 繰り返し/)).toBeInTheDocument()
  })
})

describe('RepeatingBandRenderer — ライブレンダラー (records provided)', () => {
  it('renders live records without error', () => {
    const records = [
      { no: '1', name: '商品A', quantity: 2, unit: '個', unitPrice: 100, amount: 200 },
      { no: '2', name: '商品B', quantity: 1, unit: '個', unitPrice: 500, amount: 500 },
    ]
    const { container } = render(
      <RepeatingBandRenderer element={makeElement()} records={records} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders empty records array without error', () => {
    const { container } = render(
      <RepeatingBandRenderer element={makeElement()} records={[]} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })
})
