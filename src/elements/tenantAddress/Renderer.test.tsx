import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TenantAddressRenderer } from './Renderer'
import type { TenantAddressElement } from '@/types'

const el = {
  id: 't', type: 'tenantAddress',
  position: { x: 0, y: 0 }, size: { width: 80, height: 10 },
  zIndex: 0, visible: true, locked: false, style: {},
} as unknown as TenantAddressElement

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ tenantInfo: null })
})

describe('TenantAddressRenderer', () => {
  it('renders the {{住所}} placeholder muted + italic in design mode', () => {
    render(<TenantAddressRenderer element={el} resolveValues={false} />)
    const node = screen.getByText('{{住所}}')
    expect(node).toHaveStyle({ fontStyle: 'italic' })
  })

  it('resolves 〒 + address in single-line mode from tenant info', () => {
    useReportStore.setState({
      tenantInfo: { postalCode: '100-0001', address1: '東京都千代田区', address2: '1-1 サンプルビル' },
    })
    render(<TenantAddressRenderer element={el} resolveValues={true} />)
    expect(screen.getByText('〒100-0001 東京都千代田区1-1 サンプルビル')).toBeInTheDocument()
  })

  it('falls back to the legacy single `address` field (backward compat)', () => {
    useReportStore.setState({ tenantInfo: { address: '東京都港区1-2-3' } })
    render(<TenantAddressRenderer element={el} resolveValues={true} />)
    expect(screen.getByText('東京都港区1-2-3')).toBeInTheDocument()
  })

  it('renders each address part on its own line in multiLine mode', () => {
    useReportStore.setState({
      tenantInfo: { postalCode: '100-0001', address1: '東京都千代田区', address2: '1-1' },
    })
    const multiEl = { ...el, displayMode: 'multiLine' } as unknown as TenantAddressElement
    const { container } = render(<TenantAddressRenderer element={multiEl} resolveValues={true} />)
    expect(container.textContent).toBe('〒100-0001\n東京都千代田区\n1-1')
  })

  it('prefers element fallback over the default 未設定 text', () => {
    const fallbackEl = { ...el, fallback: '住所は口頭で' } as unknown as TenantAddressElement
    render(<TenantAddressRenderer element={fallbackEl} resolveValues={true} />)
    expect(screen.getByText('住所は口頭で')).toBeInTheDocument()
  })

  it('renders nothing without tenant info and fallback (#315)', () => {
    const { container } = render(<TenantAddressRenderer element={el} resolveValues={true} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('{{住所}}')).not.toBeInTheDocument()
  })
})
