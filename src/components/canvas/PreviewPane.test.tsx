import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { PreviewPane } from './PreviewPane'

// Mock heavy canvas components
vi.mock('./ReportCanvas', () => ({
  ReportCanvas: vi.fn(({ pageOverride, readonly }: { pageOverride: unknown; readonly: boolean }) => (
    <div data-testid="report-canvas" data-readonly={String(readonly)} data-page={JSON.stringify(pageOverride)} />
  )),
}))
vi.mock('@/components/common/ZoomControl', () => ({
  ZoomControl: vi.fn(() => <div data-testid="zoom-control" />),
}))

beforeEach(() => {
  useReportStore.getState().newReport()
  vi.clearAllMocks()
})

describe('PreviewPane', () => {
  it('renders nothing when there are no pages', () => {
    // Remove all pages so selectActivePage returns null
    useReportStore.setState((state) => ({
      ...state,
      definition: { ...state.definition, pages: [] },
      selection: { ...state.selection, activePageId: null },
    }))
    const { container } = render(<PreviewPane />)
    expect(container.firstChild).toBeNull()
  })

  it('renders canvas when pages exist', () => {
    render(<PreviewPane />)
    expect(screen.getByTestId('report-canvas')).toBeInTheDocument()
  })

  it('passes readonly=true to ReportCanvas', () => {
    render(<PreviewPane />)
    expect(screen.getByTestId('report-canvas').dataset.readonly).toBe('true')
  })

  it('shows "ライブプレビュー" label', () => {
    render(<PreviewPane />)
    expect(screen.getByText('ライブプレビュー')).toBeInTheDocument()
  })

  it('shows page counter', () => {
    render(<PreviewPane />)
    // newReport() creates one page → "ページ 1 / 1" in one span
    expect(screen.getByText(/ページ.*1 \/ 1/)).toBeInTheDocument()
  })

  it('renders ZoomControl', () => {
    render(<PreviewPane />)
    expect(screen.getByTestId('zoom-control')).toBeInTheDocument()
  })

  it('shows updated page count after adding a page', () => {
    render(<PreviewPane />)
    expect(screen.getByText(/ページ.*1 \/ 1/)).toBeInTheDocument()

    useReportStore.getState().addPage()
    render(<PreviewPane />)
    expect(screen.getAllByText(/\/ 2/).length).toBeGreaterThan(0)
  })
})
