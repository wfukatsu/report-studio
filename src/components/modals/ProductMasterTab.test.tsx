import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useReportStore } from '@/store'
import type { Product } from '@/types'
import { ProductMasterTab } from './ProductMasterTab'
import { tk } from '@/test/i18n'

const k = (key: string, opts?: Record<string, unknown>) => tk(`modals:productMasterTab.${key}`, opts)

function mkProduct(i: number): Product {
  const code = `P${String(i).padStart(3, '0')}`
  return {
    id: `id-${i}`,
    code,
    name: `商品${code}`,
    unitPrice: i * 100,
    category: 'cat',
    description: '',
    stockCount: i,
    taxType: i % 3 === 0 ? 'standard' : i % 3 === 1 ? 'reduced' : 'none',
    unit: '個',
    manufacturer: '',
    subscriptionPeriod: null,
    subscriptionPriceUnit: null,
    customFields: {},
    priceHistory: [],
    deletedAt: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    version: 1,
  }
}

function seed(count: number) {
  useReportStore.setState({
    products: Array.from({ length: count }, (_, i) => mkProduct(i)),
    customFieldDefs: [],
    productsLoading: false,
    productsError: null,
    productOps: new Map(),
    fetchProducts: vi.fn().mockResolvedValue(undefined),
    fetchCustomFieldDefs: vi.fn().mockResolvedValue(undefined),
    deleteProduct: vi.fn().mockResolvedValue(undefined),
    setProductOp: vi.fn(),
  })
}

// Codes of the product rows currently rendered in the body, in display order.
function visibleCodes(): string[] {
  const table = screen.getByLabelText(k('productListLabel'))
  return within(table)
    .getAllByRole('row')
    .slice(1) // drop header
    .map((r) => within(r).getAllByRole('cell')[0].textContent ?? '')
}

describe('ProductMasterTab — pagination & sorting (#333)', () => {
  beforeEach(() => seed(120))

  it('renders only one page (50) of a large catalog and shows page info', () => {
    render(<ProductMasterTab />)
    expect(visibleCodes()).toHaveLength(50)
    expect(screen.getByText(k('pageInfo', { current: 1, total: 3 }))).toBeInTheDocument()
    // default sort code asc → first page starts at P000
    expect(visibleCodes()[0]).toBe('P000')
    expect(screen.queryByText('P050')).not.toBeInTheDocument()
  })

  it('advances to the next page', () => {
    render(<ProductMasterTab />)
    fireEvent.click(screen.getByRole('button', { name: k('nextPage') }))
    expect(screen.getByText(k('pageInfo', { current: 2, total: 3 }))).toBeInTheDocument()
    expect(visibleCodes()[0]).toBe('P050')
    expect(screen.queryByText('P000')).not.toBeInTheDocument()
  })

  it('filtering resets to the first page and hides pagination when it fits one page', () => {
    render(<ProductMasterTab />)
    fireEvent.click(screen.getByRole('button', { name: k('nextPage') })) // go to page 2 first
    fireEvent.change(screen.getByLabelText(k('searchLabel')), { target: { value: 'P05' } })
    // P050..P059 → 10 matches, single page, no pager
    expect(visibleCodes()).toHaveLength(10)
    expect(screen.queryByText(k('pageInfo', { current: 1, total: 1 }))).not.toBeInTheDocument()
    expect(visibleCodes()).toContain('P050')
  })

  it('sorts by the newly added stock column (descending)', () => {
    render(<ProductMasterTab />)
    const stockHeader = screen.getByText(k('columns.stockCount'))
    fireEvent.click(stockHeader) // asc
    fireEvent.click(stockHeader) // desc
    // highest stock (i=119) first
    expect(visibleCodes()[0]).toBe('P119')
  })

  it('exposes the tax column as sortable', () => {
    render(<ProductMasterTab />)
    const taxHeader = screen.getByText(k('taxColumn')).closest('th')!
    expect(taxHeader).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(taxHeader)
    expect(taxHeader).toHaveAttribute('aria-sort', 'ascending')
  })
})
