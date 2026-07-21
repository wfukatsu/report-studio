import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useToolbarExport } from './useToolbarExport'

// Server PDF success/failure is the branch under test (#326)
vi.mock('@/api/reportApi', () => ({
  generateStatelessPdf: vi.fn(),
  generateStatelessExcel: vi.fn(),
  generateTemplatePdf: vi.fn(),
  evaluateValidate: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  downloadBlob: vi.fn(),
}))
vi.mock('@/lib/exportUtils', () => ({
  exportReportToPdf: vi.fn().mockResolvedValue(undefined),
  exportReportToPdfBlob: vi.fn(),
  exportPageToPng: vi.fn(),
  collectAutoFieldModels: vi.fn().mockReturnValue([]),
}))

import { generateStatelessPdf } from '@/api/reportApi'
import { downloadBlob } from '@/api/client'

function renderExportHook() {
  return renderHook(() =>
    useToolbarExport({
      canvasRefs: [],
      reportName: 'テスト帳票',
      pages: [],
      activePage: null,
      setShowVariantDialog: vi.fn(),
      setShowValidationWarnConfirm: vi.fn(),
      setValidationWarnings: vi.fn(),
    }),
  )
}

describe('useToolbarExport — isExporting のリセット (#326)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('サーバPDF成功後に isExporting が false へ戻る', async () => {
    vi.mocked(generateStatelessPdf).mockResolvedValue(new Blob(['%PDF']))

    const { result } = renderExportHook()

    await act(async () => {
      await result.current.handleExportPdf()
    })

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.isExporting).toBe(false))
  })

  it('サーバPDF失敗（クライアントフォールバック）後も isExporting が false へ戻る', async () => {
    vi.mocked(generateStatelessPdf).mockRejectedValue(new Error('HTTP 500'))

    const { result } = renderExportHook()

    await act(async () => {
      await result.current.handleExportPdf()
    })

    await waitFor(() => expect(result.current.isExporting).toBe(false))
  })
})
