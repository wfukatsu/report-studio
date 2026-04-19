import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ResponsesPanel } from './ResponsesPanel'
import type { FormResponseSummary } from '@/lib/schemas/formResponse'

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
vi.mock('@/api/client', () => ({
  downloadBlob: vi.fn(),
  apiFetch: vi.fn(),
  apiFetchBlobWithFilename: vi.fn(),
}))

import { listResponses, deleteResponse } from '@/api/reportApi'
const mockList = vi.mocked(listResponses)
const mockDelete = vi.mocked(deleteResponse)

const makeSummary = (id: string): FormResponseSummary => ({
  id,
  templateId: 'tpl-1',
  submittedAt: new Date('2026-01-01T10:00:00Z').getTime(),
  submittedBy: 'user@example.com',
  summary: [`${id}: value`],
})

const SAMPLE_RESPONSES = [makeSummary('r1'), makeSummary('r2')]
const SAMPLE_LIST = { items: SAMPLE_RESPONSES, total: 2 }

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
    mockList.mockResolvedValue({ items: [], total: 0 })
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getByText('回答がまだありません。')).toBeInTheDocument())
  })

  it('shows error when fetch fails', async () => {
    mockList.mockRejectedValueOnce(new Error('Network error'))
    render(<ResponsesPanel />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'))
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
    mockList.mockResolvedValue({ items: [], total: 0 })
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
