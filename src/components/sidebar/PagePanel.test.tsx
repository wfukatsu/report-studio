import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PagePanel } from './PagePanel'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('PagePanel', () => {
  it('renders without crashing', () => {
    render(<PagePanel />)
    expect(screen.getByText('ページ一覧')).toBeInTheDocument()
  })

  it('renders existing pages', () => {
    render(<PagePanel />)
    const state = useReportStore.getState()
    const firstPage = state.definition.pages[0]
    expect(screen.getByDisplayValue(firstPage.name)).toBeInTheDocument()
  })

  it('renders the add page button', () => {
    render(<PagePanel />)
    expect(screen.getByTitle('ページを追加')).toBeInTheDocument()
  })

  it('adds a new page when add button is clicked', () => {
    render(<PagePanel />)
    const initialCount = useReportStore.getState().definition.pages.length
    fireEvent.click(screen.getByTitle('ページを追加'))
    expect(useReportStore.getState().definition.pages.length).toBe(initialCount + 1)
  })

  it('does not show delete button when only one page exists', () => {
    render(<PagePanel />)
    expect(screen.queryByTitle('ページを削除')).not.toBeInTheDocument()
  })

  it('shows delete button when multiple pages exist', () => {
    useReportStore.getState().addPage()
    render(<PagePanel />)
    // Delete buttons appear on hover — they exist in DOM but hidden via opacity-0
    const deleteButtons = screen.getAllByTitle('ページを削除')
    expect(deleteButtons.length).toBeGreaterThan(0)
  })

  it('switches active page when a page is clicked', () => {
    useReportStore.getState().addPage('ページ2')
    const state = useReportStore.getState()
    const pages = state.definition.pages
    const secondPageId = pages[1].id

    render(<PagePanel />)
    // Click on the container div of the second page (find by the page name input)
    const secondPageInput = screen.getByDisplayValue('ページ2')
    const pageRow = secondPageInput.closest('div[class*="flex"]')!
    fireEvent.click(pageRow)

    expect(useReportStore.getState().selection.activePageId).toBe(secondPageId)
  })

  it('renames a page when the page name input changes', () => {
    render(<PagePanel />)
    const state = useReportStore.getState()

    const input = screen.getByDisplayValue(state.definition.pages[0].name)
    fireEvent.change(input, { target: { value: '新しいページ名' } })

    expect(useReportStore.getState().definition.pages[0].name).toBe('新しいページ名')
  })

  it('deletes a page when delete is confirmed', () => {
    useReportStore.getState().addPage('削除対象')
    const initialCount = useReportStore.getState().definition.pages.length

    render(<PagePanel />)
    const deleteButtons = screen.getAllByTitle('ページを削除')
    fireEvent.click(deleteButtons[0])

    // ConfirmDialog opens — click the confirm button
    fireEvent.click(screen.getByText('削除'))

    expect(useReportStore.getState().definition.pages.length).toBe(initialCount - 1)
  })

  it('does not delete a page when delete is cancelled', () => {
    useReportStore.getState().addPage('保持対象')
    const initialCount = useReportStore.getState().definition.pages.length

    render(<PagePanel />)
    const deleteButtons = screen.getAllByTitle('ページを削除')
    fireEvent.click(deleteButtons[0])

    // ConfirmDialog opens — click cancel
    fireEvent.click(screen.getByText('キャンセル'))

    expect(useReportStore.getState().definition.pages.length).toBe(initialCount)
  })
})
