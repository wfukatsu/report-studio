import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { DataGrid } from './DataGrid'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import type { DataSourceNode } from '@/store/dataBrowserStore'
import type { Product } from '@/types'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    scanScalarDbTable: vi.fn(),
    listResponses: vi.fn(),
    getProducts: vi.fn(),
    deleteScalarDbRow: vi.fn(),
    updateScalarDbRow: vi.fn(),
    insertScalarDbRow: vi.fn(),
  }
})
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, downloadBlob: vi.fn() }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import {
  scanScalarDbTable, listResponses, getProducts,
  deleteScalarDbRow, updateScalarDbRow,
} from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import { toast } from 'sonner'

const mockScan = vi.mocked(scanScalarDbTable)
const mockListResponses = vi.mocked(listResponses)
const mockGetProducts = vi.mocked(getProducts)
const mockDelete = vi.mocked(deleteScalarDbRow)
const mockUpdate = vi.mocked(updateScalarDbRow)
const mockDownloadBlob = vi.mocked(downloadBlob)

const TABLE_SOURCE: DataSourceNode = { kind: 'scalardb-table', namespace: 'sales', table: 'orders' }
const SYSTEM_SOURCE: DataSourceNode = { kind: 'scalardb-table', namespace: 'report_studio', table: 'templates' }

function scanResponse(overrides: Record<string, unknown> = {}) {
  return {
    columns: [
      { name: 'id', type: 'INT', keyType: 'partition' },
      { name: 'name', type: 'TEXT' },
      { name: 'qty', type: 'INT' },
    ],
    rows: [
      { id: 1, name: 'Alpha', qty: 5 },
      { id: 2, name: 'Beta', qty: 2 },
    ],
    total: 2,
    truncated: false,
    offset: 0,
    limit: 50,
    ...overrides,
  } as never
}

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p1', code: 'SKU-001', name: '商品A', unitPrice: 100, category: '文具',
    description: '', stockCount: 1, taxType: 'standard', unit: '個', manufacturer: 'ACME',
    subscriptionPeriod: null, subscriptionPriceUnit: null, customFields: {},
    priceHistory: [], deletedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', version: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDataBrowserStore.setState({
    selectedSource: null, searchQuery: '', sortCol: null, sortDir: 'asc',
    currentPage: 0, detailRow: null,
  })
  mockScan.mockResolvedValue(scanResponse())
  mockDelete.mockResolvedValue({ message: 'ok' } as never)
  mockUpdate.mockResolvedValue({ row: {} } as never)
})

describe('DataGrid — ScalarDB table source', () => {
  it('loads and renders rows for the selected table', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(mockScan).toHaveBeenCalledWith('sales', 'orders', { offset: 0, limit: 50 })
  })

  it('shows the error state with the API message when loading fails', async () => {
    mockScan.mockRejectedValueOnce(new Error('connection refused'))
    render(<DataGrid source={TABLE_SOURCE} />)
    expect(await screen.findByText('データの読み込みに失敗しました')).toBeInTheDocument()
    expect(screen.getByText('connection refused')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })

  it('shows an empty message when the table has no rows', async () => {
    mockScan.mockResolvedValueOnce(scanResponse({ rows: [], total: 0 }))
    render(<DataGrid source={TABLE_SOURCE} />)
    expect(await screen.findByText('データがありません')).toBeInTheDocument()
  })

  it('filters rows client-side via the search box', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.change(screen.getByLabelText('データを検索'), { target: { value: 'beta' } })
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('shows a no-match message including the query', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.change(screen.getByLabelText('データを検索'), { target: { value: 'zzz' } })
    expect(screen.getByText('「zzz」に一致するデータがありません')).toBeInTheDocument()
  })

  it('sorts rows on header click and toggles direction on second click', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')

    const qtyHeader = screen.getByRole('columnheader', { name: 'qty' })
    fireEvent.click(qtyHeader)
    expect(qtyHeader).toHaveAttribute('aria-sort', 'ascending')
    let rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Beta')).toBeInTheDocument() // qty 2 first

    fireEvent.click(qtyHeader)
    expect(qtyHeader).toHaveAttribute('aria-sort', 'descending')
    rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Alpha')).toBeInTheDocument() // qty 5 first
  })

  it('exports the current page as CSV', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getByRole('button', { name: 'CSVエクスポート' }))
    expect(mockDownloadBlob).toHaveBeenCalledTimes(1)
    expect(mockDownloadBlob.mock.calls[0][1]).toMatch(/^sales_orders_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('shows the truncation warning when the scan is truncated', async () => {
    mockScan.mockResolvedValueOnce(scanResponse({ truncated: true, total: 10000 }))
    render(<DataGrid source={TABLE_SOURCE} />)
    expect(await screen.findByText('上位 10,000 件のみ表示')).toBeInTheDocument()
  })
})

describe('DataGrid — CRUD on writable tables', () => {
  it('offers 行を追加 for user namespaces but not for system namespaces', async () => {
    const { unmount } = render(<DataGrid source={TABLE_SOURCE} />)
    expect(await screen.findByRole('button', { name: /行を追加/ })).toBeInTheDocument()
    unmount()

    render(<DataGrid source={SYSTEM_SOURCE} />)
    await screen.findByText('Alpha')
    expect(screen.queryByRole('button', { name: /行を追加/ })).not.toBeInTheDocument()
  })

  it('opens the create modal from 行を追加', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getByRole('button', { name: /行を追加/ }))
    expect(screen.getByText('行を追加 — sales.orders')).toBeInTheDocument()
  })

  it('opens the edit modal when a row of a writable table is clicked', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    fireEvent.click(await screen.findByText('Alpha'))
    expect(screen.getByText('行を編集 — sales.orders')).toBeInTheDocument()
  })

  it('deletes a row with its key columns after confirmation', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getAllByRole('button', { name: '行を削除' })[0])
    expect(screen.getByText('この行を削除してもよろしいですか？この操作は元に戻せません。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('sales', 'orders', { id: 1 }))
    // Reload after delete
    await waitFor(() => expect(mockScan).toHaveBeenCalledTimes(2))
  })

  it('cancels deletion without calling the API', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getAllByRole('button', { name: '行を削除' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('commits an inline cell edit with keys + typed value on Enter', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    const cell = await screen.findByText('Alpha')
    fireEvent.doubleClick(cell)

    const input = screen.getByDisplayValue('Alpha')
    fireEvent.change(input, { target: { value: 'Alpha2' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('sales', 'orders', { id: 1, name: 'Alpha2' }),
    )
    await waitFor(() => expect(mockScan).toHaveBeenCalledTimes(2))
  })

  it('parses INT columns on inline edit', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.doubleClick(screen.getByText('5'))

    const input = screen.getByDisplayValue('5')
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('sales', 'orders', { id: 1, qty: 9 }),
    )
  })

  it('shows a toast when the inline update fails', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('conflict'))
    render(<DataGrid source={TABLE_SOURCE} />)
    const cell = await screen.findByText('Alpha')
    fireEvent.doubleClick(cell)
    const input = screen.getByDisplayValue('Alpha')
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'セルの更新に失敗しました',
      expect.objectContaining({ description: 'conflict' }),
    ))
  })

  it('does not enter inline edit mode on key columns', async () => {
    render(<DataGrid source={TABLE_SOURCE} />)
    await screen.findByText('Alpha')
    fireEvent.doubleClick(screen.getByText('1'))
    expect(screen.queryByDisplayValue('1')).not.toBeInTheDocument()
  })
})

describe('DataGrid — pagination', () => {
  it('renders page count from the server total and fetches the next page', async () => {
    mockScan.mockResolvedValue(scanResponse({ total: 120 }))
    render(<DataGrid source={TABLE_SOURCE} />)
    expect(await screen.findByText('1 / 3 ページ')).toBeInTheDocument()

    const prev = screen.getByRole('button', { name: '前のページ' })
    expect(prev).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '次のページ' }))
    await waitFor(() =>
      expect(mockScan).toHaveBeenCalledWith('sales', 'orders', { offset: 50, limit: 50 }),
    )
    expect(await screen.findByText('2 / 3 ページ')).toBeInTheDocument()
  })
})

describe('DataGrid — product master source', () => {
  it('renders product rows and opens the read-only detail panel on click', async () => {
    mockGetProducts.mockResolvedValue([
      makeProduct({ id: 'p1', code: 'SKU-001', name: '商品A' }),
      makeProduct({ id: 'p2', code: 'SKU-002', name: '商品B' }),
    ])
    render(<DataGrid source={{ kind: 'product-master' }} />)
    expect(await screen.findByText('商品A')).toBeInTheDocument()
    expect(screen.getByText('SKU-002')).toBeInTheDocument()
    // Read-only source: no create button
    expect(screen.queryByRole('button', { name: /行を追加/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('商品A'))
    expect(await screen.findByRole('dialog', { name: '行の詳細' })).toBeInTheDocument()
  })

  it('shows the error state when products cannot be loaded', async () => {
    mockGetProducts.mockRejectedValueOnce(new Error('boom'))
    render(<DataGrid source={{ kind: 'product-master' }} />)
    expect(await screen.findByText('データの読み込みに失敗しました')).toBeInTheDocument()
  })
})

describe('DataGrid — form responses source', () => {
  it('renders response summaries with the server-side total', async () => {
    mockListResponses.mockResolvedValue({
      items: [
        {
          id: 'r1', templateId: 'tpl-1',
          submittedAt: new Date('2026-01-01T10:00:00Z').getTime(),
          submittedBy: 'user@example.com', summary: ['項目: 値'],
        },
      ],
      total: 1, offset: 0, limit: 50, hasMore: false,
    } as never)
    render(<DataGrid source={{ kind: 'form-responses', templateId: 'tpl-1', templateName: '見積書' }} />)
    expect(await screen.findByText('user@example.com')).toBeInTheDocument()
    expect(screen.getByText('項目: 値')).toBeInTheDocument()
    expect(mockListResponses).toHaveBeenCalledWith('tpl-1', { offset: 0, limit: 50 })
  })
})
