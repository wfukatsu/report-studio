import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { PageSettingsPanel } from './PageSettingsPanel'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('PageSettingsPanel — レンダリング', () => {
  it('renders page settings heading', () => {
    render(<PageSettingsPanel />)
    expect(screen.getByText('ページ設定')).toBeInTheDocument()
  })

  it('renders paper size selector', () => {
    render(<PageSettingsPanel />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    // A4 is default
    expect(screen.getByRole('combobox')).toHaveValue('A4')
  })

  it('renders orientation buttons', () => {
    render(<PageSettingsPanel />)
    expect(screen.getByText('縦 (Portrait)')).toBeInTheDocument()
    expect(screen.getByText('横 (Landscape)')).toBeInTheDocument()
  })

  it('renders margin inputs', () => {
    render(<PageSettingsPanel />)
    // Four margin labels
    expect(screen.getByText('上')).toBeInTheDocument()
    expect(screen.getByText('右')).toBeInTheDocument()
    expect(screen.getByText('下')).toBeInTheDocument()
    expect(screen.getByText('左')).toBeInTheDocument()
  })

  it('renders background color input', () => {
    render(<PageSettingsPanel />)
    expect(screen.getByText('背景色')).toBeInTheDocument()
  })

  it('renders page name input with current page name', () => {
    render(<PageSettingsPanel />)
    const activePage = useReportStore.getState().definition.pages[0]
    const nameInput = screen.getByDisplayValue(activePage.name)
    expect(nameInput).toBeInTheDocument()
  })
})

describe('PageSettingsPanel — 用紙サイズ変更', () => {
  it('updates paper size when selector changes', () => {
    render(<PageSettingsPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'A3' } })

    const state = useReportStore.getState()
    expect(state.definition.pageSettings.paperSize).toBe('A3')
  })

  it('shows page dimensions', () => {
    render(<PageSettingsPanel />)
    // A4 portrait: 210x297mm
    expect(screen.getAllByText(/210×297mm/).length).toBeGreaterThanOrEqual(1)
  })
})

describe('PageSettingsPanel — 用紙方向', () => {
  it('sets orientation to landscape when landscape button clicked', () => {
    render(<PageSettingsPanel />)
    fireEvent.click(screen.getByText('横 (Landscape)'))

    const state = useReportStore.getState()
    expect(state.definition.pageSettings.orientation).toBe('landscape')
  })

  it('sets orientation back to portrait when portrait button clicked', () => {
    render(<PageSettingsPanel />)
    fireEvent.click(screen.getByText('横 (Landscape)'))
    fireEvent.click(screen.getByText('縦 (Portrait)'))

    const state = useReportStore.getState()
    expect(state.definition.pageSettings.orientation).toBe('portrait')
  })
})

describe('PageSettingsPanel — ページ名変更', () => {
  it('updates page name when input changes', () => {
    render(<PageSettingsPanel />)
    const activePage = useReportStore.getState().definition.pages[0]
    const nameInput = screen.getByDisplayValue(activePage.name)
    fireEvent.change(nameInput, { target: { value: '新しいページ' } })

    const state = useReportStore.getState()
    expect(state.definition.pages[0].name).toBe('新しいページ')
  })
})

describe('PageSettingsPanel — テンプレート変更', () => {
  it('renders template change button when onTemplateChange is provided', () => {
    const handleTemplateChange = vi.fn()
    render(<PageSettingsPanel onTemplateChange={handleTemplateChange} />)
    expect(screen.getByText('テンプレートを変更...')).toBeInTheDocument()
  })

  it('calls onTemplateChange when template button is clicked', () => {
    const handleTemplateChange = vi.fn()
    render(<PageSettingsPanel onTemplateChange={handleTemplateChange} />)
    fireEvent.click(screen.getByText('テンプレートを変更...'))
    expect(handleTemplateChange).toHaveBeenCalledOnce()
  })

  it('does not render template button when onTemplateChange is not provided', () => {
    render(<PageSettingsPanel />)
    expect(screen.queryByText('テンプレートを変更...')).not.toBeInTheDocument()
  })
})
