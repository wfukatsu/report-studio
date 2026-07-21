import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TenantPhoneRenderer } from './Renderer'
import type { TenantPhoneElement } from '@/types'

const el = {
  id: 't', type: 'tenantPhone',
  position: { x: 0, y: 0 }, size: { width: 60, height: 10 },
  zIndex: 0, visible: true, locked: false, style: {},
} as unknown as TenantPhoneElement

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ tenantInfo: null })
})

describe('TenantPhoneRenderer', () => {
  it('renders the {{電話番号}} placeholder muted + italic in design mode', () => {
    render(<TenantPhoneRenderer element={el} resolveValues={false} />)
    const node = screen.getByText('{{電話番号}}')
    expect(node).toHaveStyle({ fontStyle: 'italic' })
  })

  it('resolves the phone number from tenant info', () => {
    useReportStore.setState({ tenantInfo: { phone: '03-1234-5678' } })
    render(<TenantPhoneRenderer element={el} resolveValues={true} />)
    const node = screen.getByText('03-1234-5678')
    expect(node).toHaveStyle({ fontStyle: 'normal' })
  })

  it('prefers element fallback over the default 未設定 text', () => {
    const fallbackEl = { ...el, fallback: 'TEL 未登録' } as unknown as TenantPhoneElement
    render(<TenantPhoneRenderer element={fallbackEl} resolveValues={true} />)
    expect(screen.getByText('TEL 未登録')).toBeInTheDocument()
  })

  it('renders nothing without tenant info and fallback (#315)', () => {
    const { container } = render(<TenantPhoneRenderer element={el} resolveValues={true} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('{{電話番号}}')).not.toBeInTheDocument()
  })
})
