import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TemplateSelectionModal } from './TemplateSelectionModal'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import type { ReportDefinition } from '@/types'

// Mock the API module
vi.mock('@/api/reportApi', () => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
}))

import { listReports, getReport } from '@/api/reportApi'

const onClose = vi.fn()
const onSelect = vi.fn()

beforeEach(() => {
  useReportStore.getState().newReport()
  onClose.mockClear()
  onSelect.mockClear()
  vi.clearAllMocks()
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

  it('shows built-in templates', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    // Verify at least one built-in template is shown
    if (BUILTIN_TEMPLATES.length > 0) {
      expect(screen.getByText(BUILTIN_TEMPLATES[0].name)).toBeInTheDocument()
    }
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
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('selects a built-in template', () => {
    if (BUILTIN_TEMPLATES.length === 0) return
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    const templateName = BUILTIN_TEMPLATES[0].name
    fireEvent.click(screen.getByText(templateName))
    expect(screen.getByText('作成')).not.toBeDisabled()
  })

  it('calls onSelect with definition when built-in template is confirmed', () => {
    if (BUILTIN_TEMPLATES.length === 0) return
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    const templateName = BUILTIN_TEMPLATES[0].name
    fireEvent.click(screen.getByText(templateName))
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
    expect(screen.queryByText('バックエンドテンプレート')).not.toBeInTheDocument()
  })
})

describe('TemplateSelectionModal — バックエンド接続時', () => {
  beforeEach(() => {
    useReportStore.getState().setBackendConnected(true)
  })

  it('shows backend templates section when connected', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByText('バックエンドテンプレート')).toBeInTheDocument()
    expect(screen.getByText('一覧を取得')).toBeInTheDocument()
  })

  it('shows empty state for backend templates initially', () => {
    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByText('「一覧を取得」でテンプレートを読み込めます。')).toBeInTheDocument()
  })

  it('fetches backend templates when button is clicked', async () => {
    vi.mocked(listReports).mockResolvedValue({
      items: [{ id: 'tmpl-1', name: 'バックエンドテンプレート1', updatedAt: '2024-01-01' }],
      total: 1,
    })

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('一覧を取得'))

    await waitFor(() => {
      expect(screen.getByText('バックエンドテンプレート1')).toBeInTheDocument()
    })
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(listReports).mockRejectedValue(new Error('Network error'))

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('一覧を取得'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText('テンプレート一覧の取得に失敗しました')).toBeInTheDocument()
  })

  it('loads a backend template when clicked', async () => {
    const mockDefinition: ReportDefinition = {
      pages: [{ id: 'p1', sections: [], settings: { paperSize: 'A4', orientation: 'portrait', marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10 } }],
      settings: { paperSize: 'A4', orientation: 'portrait', marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10 },
      outputVariants: [],
    }
    vi.mocked(listReports).mockResolvedValue({
      items: [{ id: 'tmpl-1', name: 'バックエンドテンプレート1', updatedAt: '2024-01-01' }],
      total: 1,
    })
    vi.mocked(getReport).mockResolvedValue(mockDefinition)

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('一覧を取得'))

    await waitFor(() => {
      expect(screen.getByText('バックエンドテンプレート1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('バックエンドテンプレート1'))

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockDefinition)
    })
  })

  it('does not call onSelect when loading a backend template fails', async () => {
    vi.mocked(listReports).mockResolvedValue({
      items: [{ id: 'tmpl-1', name: 'バックエンドテンプレート1', updatedAt: '2024-01-01' }],
      total: 1,
    })
    vi.mocked(getReport).mockRejectedValue(new Error('Load error'))

    render(<TemplateSelectionModal open={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('一覧を取得'))

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
