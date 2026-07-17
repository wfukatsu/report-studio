import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DataBrowserPage } from './DataBrowserPage'
import { useReportStore } from '@/store'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import type { Me } from '@/api/reportApi'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    getMe: vi.fn(),
    fetchScalarDbCatalogCached: vi.fn().mockResolvedValue({ namespaces: [] }),
    listReports: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    scanScalarDbTable: vi.fn(),
  }
})

import { getMe, scanScalarDbTable } from '@/api/reportApi'
const mockGetMe = vi.mocked(getMe)
const mockScan = vi.mocked(scanScalarDbTable)

const USER: Me = { userId: 'u1', displayName: 'ユーザー1', roles: ['user'], anonymous: false }

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/data-browser']}>
      <Routes>
        <Route path="/data-browser" element={<DataBrowserPage />} />
        <Route path="/" element={<div>DESIGNER-HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useDataBrowserStore.setState({
    selectedSource: null, searchQuery: '', sortCol: null, sortDir: 'asc',
    currentPage: 0, detailRow: null,
  })
  useReportStore.setState({ currentUser: null, authLoading: false } as never)
})

describe('DataBrowserPage — auth gating', () => {
  it('renders nothing while auth state is loading', () => {
    // getMe never resolves → checkAuth keeps authLoading=true
    mockGetMe.mockReturnValue(new Promise(() => {}))
    useReportStore.setState({ authLoading: true } as never)
    const { container } = renderPage()
    expect(container).toBeEmptyDOMElement()
  })

  it('redirects to the designer root when unauthenticated', async () => {
    mockGetMe.mockRejectedValue(new Error('401'))
    renderPage()
    expect(await screen.findByText('DESIGNER-HOME')).toBeInTheDocument()
  })

  it('shows the browser layout for an authenticated user', async () => {
    mockGetMe.mockResolvedValue(USER)
    useReportStore.setState({ currentUser: USER, authLoading: false } as never)
    renderPage()
    // checkAuth() runs on mount and briefly flips authLoading — wait for it to settle
    expect(await screen.findByRole('heading', { name: 'データブラウザ' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'デザイナーに戻る' })).toHaveAttribute('href', '/')
    expect(await screen.findByText('データソースを選択してください')).toBeInTheDocument()
  })
})

describe('DataBrowserPage — source selection', () => {
  it('renders the DataGrid when a source is already selected in the store', async () => {
    mockGetMe.mockResolvedValue(USER)
    mockScan.mockResolvedValue({
      columns: [{ name: 'id', type: 'INT', keyType: 'partition' }],
      rows: [{ id: 1 }],
      total: 1, truncated: false, offset: 0, limit: 50,
    } as never)
    useReportStore.setState({ currentUser: USER, authLoading: false } as never)
    useDataBrowserStore.setState({
      selectedSource: { kind: 'scalardb-table', namespace: 'sales', table: 'orders' },
    })
    renderPage()
    expect(await screen.findByRole('table', { name: 'データグリッド' })).toBeInTheDocument()
    expect(screen.queryByText('データソースを選択してください')).not.toBeInTheDocument()
  })
})
