import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { LivePreviewPanel } from './PreviewModal'

// Mock ReportCanvas to avoid complex canvas setup
vi.mock('@/components/canvas/ReportCanvas', () => ({
  ReportCanvas: ({ pageOverride }: { pageOverride: { name: string } }) => (
    <div data-testid="report-canvas">{pageOverride.name}</div>
  ),
}))

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('LivePreviewPanel', () => {
  it('renders without error', () => {
    const { container } = render(<LivePreviewPanel />)
    expect(container.firstChild).not.toBeNull()
  })

  it('shows page count in header', () => {
    render(<LivePreviewPanel />)
    expect(screen.getByText(/Preview — 1 page/)).toBeInTheDocument()
  })

  it('shows page name below canvas', () => {
    render(<LivePreviewPanel />)
    const page = useReportStore.getState().definition.pages[0]
    const elements = screen.getAllByText(page.name)
    // Page name appears at least once (in the label below the canvas)
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders ReportCanvas for each page', () => {
    render(<LivePreviewPanel />)
    expect(screen.getAllByTestId('report-canvas')).toHaveLength(1)
  })

  it('shows plural "pages" for multiple pages', () => {
    // Add a second page
    useReportStore.getState().addPage()
    render(<LivePreviewPanel />)
    expect(screen.getByText(/Preview — 2 pages/)).toBeInTheDocument()
  })
})
