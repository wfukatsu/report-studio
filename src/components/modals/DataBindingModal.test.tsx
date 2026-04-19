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
vi.mock('@/components/modals/TenantInfoTab', () => ({
  TenantInfoTab: () => <div data-testid="tenantinfo-tab">TenantInfoTab</div>,
}))
vi.mock('@/components/modals/ProductMasterTab', () => ({
  ProductMasterTab: () => <div data-testid="productmaster-tab">ProductMasterTab</div>,
}))
vi.mock('@/components/modals/WebhookTab', () => ({
  WebhookTab: () => <div data-testid="webhook-tab">WebhookTab</div>,
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

  it('switches to 計算フィールド tab on click', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: '計算フィールド' }))
    expect(screen.getByText('計算ルール')).toBeInTheDocument()
  })

  it('switches to 入力検証 tab on click', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: '入力検証' }))
    expect(screen.getByText('バリデーションルール')).toBeInTheDocument()
  })

  it('switches back to テンプレートデータ tab', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: '計算フィールド' }))
    fireEvent.click(screen.getByRole('tab', { name: 'テンプレートデータ' }))
    expect(screen.getByTestId('datasource-panel')).toBeInTheDocument()
  })

  it('switches to テナント情報 tab on click', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'テナント情報' }))
    expect(screen.getByTestId('tenantinfo-tab')).toBeInTheDocument()
  })
})

describe('DataBindingModal — タブキーボード操作', () => {
  it('navigates to next tab on ArrowRight', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    const tablist = screen.getByRole('tablist')
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    // Should now show 計算フィールド tab
    expect(screen.getByText('計算ルール')).toBeInTheDocument()
  })

  it('navigates to previous tab on ArrowLeft (wraps to last tab)', () => {
    render(<DataBindingModal open={true} onClose={vi.fn()} />)
    const tablist = screen.getByRole('tablist')
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    // From datasource, ArrowLeft wraps to the last tab (Webhook).
    expect(screen.getByTestId('webhook-tab')).toBeInTheDocument()
  })
})
