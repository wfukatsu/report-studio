import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ResponsesPanel } from './ResponsesPanel'
import type { FormResponseList, FormResponseSummary } from '@/lib/schemas/formResponse'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    listResponses: vi.fn(),
    deleteResponse: vi.fn(),
    exportResponses: vi.fn(),
    getResponsePdf: vi.fn(),
  }
})
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    downloadBlob: vi.fn(),
    apiFetch: vi.fn(),
    apiFetchBlobWithFilename: vi.fn(),
  }
})

import { listResponses, deleteResponse } from '@/api/reportApi'
import { ApiError, NetworkError } from '@/api/client'
const mockList = vi.mocked(listResponses)
const mockDelete = vi.mocked(deleteResponse)

const makeSummary = (id: string): FormResponseSummary => ({
  id,
  templateId: 'tpl-1',
  submittedAt: new Date('2026-01-01T10:00:00Z').getTime(),
  submittedBy: 'user@example.com',
  summary: [`${id}: value`],
})

const makeList = (items: FormResponseSummary[]): FormResponseList => ({
  items,
  total: items.length,
  offset: 0,
  limit: 50,
  hasMore: false,
})

const SAMPLE_RESPONSES = [makeSummary('r1'), makeSummary('r2')]
const SAMPLE_LIST = makeList(SAMPLE_RESPONSES)

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setBackendConnected(false)
  useReportStore.getState().setCurrentTemplateId(null)
  useReportStore.getState().invalidateResponsesCache()
  useReportStore.setState({ responses: [], responsesTotal: 0, responsesLoading: false } as never)
  vi.clearAllMocks()
})

describe('ResponsesPanel — offline / no template', () => {
  it('shows hint when backendConnected is false', () => {
    render(<ResponsesPanel />)
    expect(screen.getByText(/バックエンドに接続/)).toBeInTheDocument()
  })

  it('shows hint when connected but no templateId', () => {
    useReportStore.getState().setBackendConnected(true)
    render(<ResponsesPanel />)
    expect(screen.getByText(/テンプレートが未選択です/)).toBeInTheDocument()
  })
})

describe('ResponsesPanel — connected with template', () => {
  beforeEach(() => {
    useReportStore.getState().setBackendConnected(true)
    useReportStore.getState().setCurrentTemplateId('tpl-1')
  })

  it('auto-fetches on mount', async () => {
    mockList.mockResolvedValueOnce(SAMPLE_LIST)
    render(<ResponsesPanel />)
    await waitFor(() => expect(mockList).toHaveBeenCalledWith('tpl-1'))
  })

  it('renders response rows after fetch', async () => {
    mockList.mockResolvedValueOnce(SAMPLE_LIST)
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getByText('r1: value')).toBeInTheDocument())
    expect(screen.getByText('r2: value')).toBeInTheDocument()
    expect(screen.getByText('回答一覧 (2)')).toBeInTheDocument()
  })

  it('shows loading spinner during fetch', async () => {
    let resolve: (v: typeof SAMPLE_LIST) => void
    mockList.mockReturnValueOnce(new Promise((r) => { resolve = r }) as never)
    render(<ResponsesPanel />)
    expect(screen.getByRole('list', { name: /フォーム回答一覧/ })).toBeInTheDocument()
    resolve!(SAMPLE_LIST)
    await waitFor(() => expect(screen.getByText('r1: value')).toBeInTheDocument())
  })

  it('shows empty state when no responses', async () => {
    mockList.mockResolvedValue(makeList([]))
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getByText('回答がまだありません。')).toBeInTheDocument())
  })

  it('fetches exactly once for an empty result (no refetch loop)', async () => {
    // Regression: an empty list used to fail the cache-freshness guard
    // (responses.length > 0), so every fetch re-triggered the mount effect —
    // an infinite request loop that starved the event loop under
    // already-resolved mocks (CI hang) and hammered the backend in production.
    mockList.mockResolvedValue(makeList([]))
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getByText('回答がまだありません。')).toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('shows R3-compliant error banner when fetch fails (no raw HTTP / English text)', async () => {
    mockList.mockRejectedValueOnce(new ApiError(503, null, 'HTTP 503: Service Unavailable'))
    render(<ResponsesPanel />)
    const alert = await waitFor(() => screen.getByRole('alert'))
    // Banner shows the user-facing copy keyed by classifyError(503) → 'unreachable'.
    expect(alert).toHaveTextContent('バックエンドに接続できません')
    // Contract: no HTTP status numbers and no English stack text reach the user.
    expect(alert).not.toHaveTextContent(/HTTP/i)
    expect(alert).not.toHaveTextContent(/503/)
  })

  it('exposes a retry button on retryable banner errors', async () => {
    mockList.mockRejectedValueOnce(new NetworkError('offline'))
    render(<ResponsesPanel />)
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })

  it('uses cached responses when cache is fresh', async () => {
    // Pre-populate cache
    useReportStore.getState().setResponses(SAMPLE_RESPONSES, 2)
    render(<ResponsesPanel />)
    // Should not call list again since cache is fresh
    await new Promise((r) => setTimeout(r, 50))
    expect(mockList).not.toHaveBeenCalled()
    expect(screen.getByText('r1: value')).toBeInTheDocument()
  })

  it('opens submit modal when send button clicked', async () => {
    mockList.mockResolvedValueOnce(SAMPLE_LIST)
    render(<ResponsesPanel />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '回答を送信' }))
    expect(useReportStore.getState().submitResponseModalOpen).toBe(true)
  })

  it('export CSV button is disabled when no responses', async () => {
    mockList.mockResolvedValue(makeList([]))
    render(<ResponsesPanel />)
    await waitFor(() => screen.getByText('回答がまだありません。'))
    expect(screen.getByRole('button', { name: /CSV/ })).toBeDisabled()
  })
})

describe('ResponsesPanel — delete', () => {
  beforeEach(() => {
    useReportStore.getState().setBackendConnected(true)
    useReportStore.getState().setCurrentTemplateId('tpl-1')
  })

  it('calls deleteResponse and refreshes list on confirm', async () => {
    mockList.mockResolvedValue(SAMPLE_LIST)
    mockDelete.mockResolvedValueOnce(undefined as never)
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: '削除' }).length).toBeGreaterThan(0))
    // Click delete button — opens ConfirmDialog
    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0])
    // Confirm the deletion in the dialog
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const dialogDeleteButtons = screen.getAllByText('削除')
    // Click the confirm button inside the dialog (last one is the dialog's confirm)
    fireEvent.click(dialogDeleteButtons[dialogDeleteButtons.length - 1])
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('tpl-1', 'r1'))
    // delete triggers invalidateResponsesCache + fetchResponses(true) + possible extra re-fetch
    expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does not delete when user cancels confirm', async () => {
    mockList.mockResolvedValue(SAMPLE_LIST)
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: '削除' }).length).toBeGreaterThan(0))
    // Click delete button — opens ConfirmDialog
    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0])
    // Cancel the dialog
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByText('キャンセル'))
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
