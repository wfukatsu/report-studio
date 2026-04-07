import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { DataBindingModal } from './DataBindingModal'

// Mock child panels to simplify test
vi.mock('@/components/sidebar/DataSourcePanel', () => ({
  DataSourcePanel: () => <div data-testid="datasource-panel">DataSourcePanel</div>,
}))
vi.mock('@/components/sidebar/BindingPanel', () => ({
  BindingPanel: () => <div data-testid="binding-panel">BindingPanel</div>,
}))

beforeEach(() => {
  useReportStore.getState().newReport()
  vi.clearAllMocks()
})

describe('DataBindingModal — open/close', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<DataBindingModal open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders modal when open=true', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText('データ設定')).toBeInTheDocument()
  })

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn()
    render(<DataBindingModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('DataBindingModal — タブ切り替え', () => {
  it('shows datasource tab content by default', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('datasource-panel')).toBeInTheDocument()
  })

  it('switches to 式・計算 tab on click', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: '式・計算' }))
    expect(screen.getByText('計算ルール')).toBeInTheDocument()
  })

  it('switches to バリデーション tab on click', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'バリデーション' }))
    expect(screen.getByText('バリデーションルール')).toBeInTheDocument()
  })

  it('switches back to データソース tab', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: '式・計算' }))
    fireEvent.click(screen.getByRole('tab', { name: 'データソース' }))
    expect(screen.getByTestId('datasource-panel')).toBeInTheDocument()
  })
})

describe('DataBindingModal — タブキーボード操作', () => {
  it('navigates to next tab on ArrowRight', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    const tablist = screen.getByRole('tablist')
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    // Should now show 式・計算 tab
    expect(screen.getByText('計算ルール')).toBeInTheDocument()
  })

  it('navigates to previous tab on ArrowLeft (wraps)', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    const tablist = screen.getByRole('tablist')
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    // From datasource, ArrowLeft wraps to last tab (validation)
    expect(screen.getByText('バリデーションルール')).toBeInTheDocument()
  })
})
