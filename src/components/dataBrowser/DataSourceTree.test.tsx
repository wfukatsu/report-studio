import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DataSourceTree } from './DataSourceTree'
import { NetworkError } from '@/api/client'
import type { DataSourceNode } from '@/store/dataBrowserStore'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    fetchScalarDbCatalogCached: vi.fn(),
    listReports: vi.fn(),
  }
})

import { fetchScalarDbCatalogCached, listReports } from '@/api/reportApi'
const mockCatalog = vi.mocked(fetchScalarDbCatalogCached)
const mockListReports = vi.mocked(listReports)

const CATALOG = {
  namespaces: [
    { name: 'sales', tables: [{ name: 'orders', columns: [] }, { name: 'customers', columns: [] }] },
    { name: 'hr', tables: [{ name: 'employees', columns: [] }] },
  ],
} as never

const TEMPLATES = {
  items: [
    { id: 'tpl-1', name: '見積書' },
    { id: 'tpl-2', name: '請求書' },
  ],
  total: 2,
} as never

beforeEach(() => {
  vi.clearAllMocks()
  mockCatalog.mockResolvedValue(CATALOG)
  mockListReports.mockResolvedValue(TEMPLATES)
})

describe('DataSourceTree — ScalarDB catalog', () => {
  it('renders tables grouped under their namespace after loading', async () => {
    render(<DataSourceTree onSelect={vi.fn()} selected={null} />)
    // Tables render by name under a namespace header (grouping — #167).
    expect(await screen.findByText('orders')).toBeInTheDocument()
    expect(screen.getByText('customers')).toBeInTheDocument()
    expect(screen.getByText('employees')).toBeInTheDocument()
    // Namespace group headers are present.
    expect(screen.getByText('sales')).toBeInTheDocument()
    expect(screen.getByText('hr')).toBeInTheDocument()
  })

  it('emits a scalardb-table node when a table is clicked', async () => {
    const onSelect = vi.fn()
    render(<DataSourceTree onSelect={onSelect} selected={null} />)
    fireEvent.click(await screen.findByText('orders'))
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'scalardb-table',
      namespace: 'sales',
      table: 'orders',
    })
  })

  it('shows an empty hint when the catalog has no namespaces', async () => {
    mockCatalog.mockResolvedValue({ namespaces: [] } as never)
    render(<DataSourceTree onSelect={vi.fn()} selected={null} />)
    expect(await screen.findByText('テーブルが設定されていません')).toBeInTheDocument()
  })

  it('shows an error banner with retry that refetches the catalog', async () => {
    mockCatalog.mockRejectedValueOnce(new NetworkError('offline'))
    render(<DataSourceTree onSelect={vi.fn()} selected={null} />)
    const retry = await screen.findByRole('button', { name: '再試行' })
    fireEvent.click(retry)
    expect(await screen.findByText('orders')).toBeInTheDocument()
    expect(mockCatalog).toHaveBeenCalledTimes(2)
  })

  it('collapses the ScalarDB section on header toggle', async () => {
    render(<DataSourceTree onSelect={vi.fn()} selected={null} />)
    await screen.findByText('orders')
    const header = screen.getByRole('button', { name: /ScalarDB テーブル/ })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('orders')).not.toBeInTheDocument()
  })
})

describe('DataSourceTree — product master', () => {
  it('emits the product-master node when clicked', async () => {
    const onSelect = vi.fn()
    render(<DataSourceTree onSelect={onSelect} selected={null} />)
    fireEvent.click(screen.getByText('商品マスター'))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'product-master' })
  })

  it('marks the product master as current when selected', () => {
    const selected: DataSourceNode = { kind: 'product-master' }
    render(<DataSourceTree onSelect={vi.fn()} selected={selected} />)
    expect(screen.getByRole('button', { name: '商品マスター' })).toHaveAttribute('aria-current', 'location')
  })
})

describe('DataSourceTree — form responses', () => {
  it('renders one leaf per template and emits a form-responses node on click', async () => {
    const onSelect = vi.fn()
    render(<DataSourceTree onSelect={onSelect} selected={null} />)
    fireEvent.click(await screen.findByText('見積書'))
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'form-responses',
      templateId: 'tpl-1',
      templateName: '見積書',
    })
    expect(screen.getByText('請求書')).toBeInTheDocument()
  })

  it('shows an empty hint when no templates exist', async () => {
    mockListReports.mockResolvedValue({ items: [], total: 0 } as never)
    render(<DataSourceTree onSelect={vi.fn()} selected={null} />)
    expect(await screen.findByText('テンプレートがありません')).toBeInTheDocument()
  })

  it('recovers from a template list error via retry', async () => {
    mockListReports.mockRejectedValueOnce(new NetworkError('offline'))
    render(<DataSourceTree onSelect={vi.fn()} selected={null} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('見積書')).toBeInTheDocument()
    expect(mockListReports).toHaveBeenCalledTimes(2)
  })
})
