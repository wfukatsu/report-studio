import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TemplateSelectionModal } from './TemplateSelectionModal'
import { createBlankDefinition } from '@/lib/templateUtils'
import type { ReportDefinition } from '@/types'

// Mock the API module
vi.mock('@/api/reportApi', () => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
  duplicateReport: vi.fn(),
  exportTemplate: vi.fn(),
  importTemplate: vi.fn(),
  deleteReport: vi.fn(),
  saveReport: vi.fn(),
  copyTemplate: vi.fn(),
  listPublicReports: vi.fn(),
  getTemplateThumbnailUrl: vi.fn((id: string) => `/api/v2/templates/${id}/thumbnail`),
}))
vi.mock('@/api/client', () => ({
  downloadBlob: vi.fn(),
  apiFetch: vi.fn(),
  apiFetchBlobWithFilename: vi.fn(),
}))

import { listReports, getReport, exportTemplate, importTemplate, listPublicReports } from '@/api/reportApi'
import { downloadBlob } from '@/api/client'

const onClose = vi.fn()
const onSelect = vi.fn()

beforeEach(() => {
  useReportStore.getState().newReport()
  onClose.mockClear()
  onSelect.mockClear()
  vi.clearAllMocks()
  // The modal auto-fetches both lists on open (#157); default them to empty so
  // tests that don't care about server templates don't hit undefined mocks.
  vi.mocked(listReports).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(listPublicReports).mockResolvedValue({ items: [], total: 0 })
})

describe('TemplateSelectionModal — 非表示', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <TemplateSelectionModal open={false} onClose={onClose} onSelect={onSelect} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('TemplateSelectionModal — 基本表示', () => {
  it('renders modal when open=true', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByText('新規レポート作成')).toBeInTheDocument()
  })

  it('renders custom title when provided', () => {
    render(
      <TemplateSelectionModal
        open={true}
        onClose={onClose}
        onSelect={onSelect}
        title="テンプレート選択"
      />,
    )
    expect(screen.getByText('テンプレート選択')).toBeInTheDocument()
  })

  it('renders custom confirm label', () => {
    render(
      <TemplateSelectionModal
        open={true}
        onClose={onClose}
        onSelect={onSelect}
        confirmLabel="選択"
      />,
    )
    expect(screen.getByText('選択')).toBeInTheDocument()
  })

  it('shows blank template option', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByText('空白')).toBeInTheDocument()
    expect(screen.getByText('白紙から作成')).toBeInTheDocument()
  })

  it('confirm button is disabled initially', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    const confirmBtn = screen.getByText('作成')
    expect(confirmBtn).toBeDisabled()
  })
})

describe('TemplateSelectionModal — テンプレート選択', () => {
  it('selects blank template and enables confirm', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('空白'))
    expect(screen.getByText('作成')).not.toBeDisabled()
  })

  it('calls onSelect and onClose when blank is selected and confirmed', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('空白'))
    fireEvent.click(screen.getByText('作成'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    // Blank start binds to no template (null) so the first save creates a new
    // one instead of overwriting the previously open template (#152).
    expect(onSelect.mock.calls[0][1]).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onSelect with a blank definition when confirmed', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('空白'))
    fireEvent.click(screen.getByText('作成'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    const definition = onSelect.mock.calls[0][0] as ReportDefinition
    expect(definition).toBeTruthy()
    expect(definition.pages).toBeTruthy()
  })
})

describe('TemplateSelectionModal — キャンセル', () => {
  it('calls onClose when cancel button is clicked', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('キャンセル'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X button is clicked', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByLabelText('閉じる'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resets selection when closed via X button', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('空白'))
    fireEvent.click(screen.getByLabelText('閉じる'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('TemplateSelectionModal — バックエンド未接続', () => {
  it('does not show backend templates section when not connected', () => {
    useReportStore.getState().setBackendConnected(false)
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.queryByText('自分のテンプレート')).not.toBeInTheDocument()
  })
})

describe('TemplateSelectionModal — バックエンド接続時', () => {
  beforeEach(() => {
    useReportStore.getState().setBackendConnected(true)
  })

  it('shows backend templates section when connected', async () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByText('自分のテンプレート')).toBeInTheDocument()
    // "一覧を取得" briefly shows a spinner during the auto-fetch, so wait for it.
    expect(await screen.findByText('一覧を取得')).toBeInTheDocument()
  })

  it('shows empty state for backend templates when none exist', async () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    // Auto-fetch (#157) resolves to the empty default → the "no saved templates" hint.
    expect(await screen.findByText('保存済みのテンプレートはまだありません。')).toBeInTheDocument()
  })

  it('auto-fetches backend templates on open', async () => {
    vi.mocked(listReports).mockResolvedValue({
      items: [{ id: 'tmpl-1', name: 'バックエンドテンプレート1', updatedAt: '2024-01-01' }],
      total: 1,
    })

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)

    // No manual "一覧を取得" click needed — the list loads on open (#157).
    await waitFor(() => {
      expect(screen.getByText('バックエンドテンプレート1')).toBeInTheDocument()
    })
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(listReports).mockRejectedValue(new Error('Network error'))

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText('テンプレート一覧の取得に失敗しました')).toBeInTheDocument()
  })

  it('loads a backend template when clicked', async () => {
    const mockDefinition: ReportDefinition = createBlankDefinition()
    vi.mocked(listReports).mockResolvedValue({
      items: [{ id: 'tmpl-1', name: 'バックエンドテンプレート1', updatedAt: '2024-01-01' }],
      total: 1,
    })
    vi.mocked(getReport).mockResolvedValue(mockDefinition)

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)

    await waitFor(() => {
      expect(screen.getByText('バックエンドテンプレート1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('バックエンドテンプレート1'))

    await waitFor(() => {
      // Loading a backend template threads its id so saves bind to it (#152).
      expect(onSelect).toHaveBeenCalledWith(mockDefinition, 'tmpl-1')
    })
  })

  it('does not call onSelect when loading a backend template fails', async () => {
    vi.mocked(listReports).mockResolvedValue({
      items: [{ id: 'tmpl-1', name: 'バックエンドテンプレート1', updatedAt: '2024-01-01' }],
      total: 1,
    })
    vi.mocked(getReport).mockRejectedValue(new Error('Load error'))

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)

    await waitFor(() => {
      expect(screen.getByText('バックエンドテンプレート1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('バックエンドテンプレート1'))

    // Wait for the async operation to complete
    await waitFor(() => {
      expect(getReport).toHaveBeenCalledWith('tmpl-1')
    })
    // onSelect should not be called because loading failed
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('TemplateSelectionModal — エクスポート/インポート', () => {
  const TEMPLATE_LIST = {
    items: [{ id: 'tmpl-1', name: 'テンプレートA', updatedAt: '2024-01-01' }],
    total: 1,
  }

  beforeEach(() => {
    useReportStore.getState().setBackendConnected(true)
    vi.mocked(listReports).mockResolvedValue(TEMPLATE_LIST)
  })

  it('export button calls exportTemplate and downloadBlob on hover click', async () => {
    const mockBlob = new Blob(['{}'], { type: 'application/json' })
    vi.mocked(exportTemplate).mockResolvedValueOnce({ blob: mockBlob, filename: 'テンプレートA.rds2.json' })
    vi.mocked(downloadBlob).mockReturnValue(undefined)

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByText('テンプレートA')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('テンプレートA をエクスポート'))

    await waitFor(() => expect(exportTemplate).toHaveBeenCalledWith('tmpl-1'))
    expect(downloadBlob).toHaveBeenCalledWith(mockBlob, 'テンプレートA.rds2.json')
  })

  it('shows error when export fails', async () => {
    vi.mocked(exportTemplate).mockRejectedValueOnce(new Error('Server error'))

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByText('テンプレートA')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('テンプレートA をエクスポート'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('エクスポートに失敗'),
    )
  })

  it('import button click triggers file input', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    const importBtn = screen.getByLabelText('テンプレートをインポート')
    const fileInput = screen.getByLabelText('インポートファイルを選択') as HTMLInputElement
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {})

    fireEvent.click(importBtn)

    expect(clickSpy).toHaveBeenCalled()
  })

  it('calls importTemplate after file selection and refreshes list', async () => {
    vi.mocked(importTemplate).mockResolvedValueOnce({ id: 'new-id', name: 'テンプレートA (インポート)' })
    vi.mocked(listReports).mockResolvedValue({
      items: [
        ...TEMPLATE_LIST.items,
        { id: 'new-id', name: 'テンプレートA (インポート)', updatedAt: '2024-01-01' },
      ],
      total: 2,
    })

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)

    // Simulate file selection with a File whose .text() resolves to JSON
    const content = '{"formatVersion":2}'
    const file = { text: vi.fn().mockResolvedValue(content) } as unknown as File
    const fileInput = screen.getByLabelText('インポートファイルを選択')
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(importTemplate).toHaveBeenCalled())
    // After successful import, the list is refreshed
    await waitFor(() => expect(listReports).toHaveBeenCalled())
  })

  it('shows error when importTemplate fails', async () => {
    vi.mocked(importTemplate).mockRejectedValueOnce(new Error('Invalid format'))

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)

    const file = { text: vi.fn().mockResolvedValue('{}') } as unknown as File
    const fileInput = screen.getByLabelText('インポートファイルを選択')
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid format'),
    )
  })
})
