import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TenantCompanyNameRenderer } from './Renderer'
import type { TenantCompanyNameElement } from '@/types'

const el = {
  id: 't', type: 'tenantCompanyName',
  position: { x: 0, y: 0 }, size: { width: 60, height: 10 },
  zIndex: 0, visible: true, locked: false, style: {},
} as unknown as TenantCompanyNameElement

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ tenantInfo: null })
})

describe('TenantCompanyNameRenderer — 差込プレースホルダ表示 (#120)', () => {
  it('renders the {{会社名}} placeholder muted + italic in design mode', () => {
    render(<TenantCompanyNameRenderer element={el} resolveValues={false} />)
    const node = screen.getByText('{{会社名}}')
    expect(node).toHaveStyle({ fontStyle: 'italic' })
    expect(node).toHaveStyle({ color: 'rgb(107, 114, 128)' })
  })

  it('does NOT apply the placeholder style when values are resolved (parity path)', () => {
    useReportStore.setState({ tenantInfo: { companyName: '株式会社サンプル', address: '', phone: '', representative: '', logoUrl: '', custom: {} } })
    render(<TenantCompanyNameRenderer element={el} resolveValues={true} />)
    const node = screen.getByText('株式会社サンプル')
    expect(node).toHaveStyle({ fontStyle: 'normal' })
  })

  it('shows the resolved fallback (not the token) in resolve mode without tenant info', () => {
    render(<TenantCompanyNameRenderer element={el} resolveValues={true} />)
    expect(screen.getByText('（会社名未設定）')).toBeInTheDocument()
    expect(screen.queryByText('{{会社名}}')).not.toBeInTheDocument()
  })
})
