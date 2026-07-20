import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TenantCustomRenderer } from './Renderer'
import type { TenantCustomElement } from '@/types'

function makeEl(overrides: Record<string, unknown> = {}): TenantCustomElement {
  return {
    id: 't', type: 'tenantCustom', fieldKey: 'fax',
    position: { x: 0, y: 0 }, size: { width: 60, height: 10 },
    zIndex: 0, visible: true, locked: false, style: {},
    ...overrides,
  } as unknown as TenantCustomElement
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ tenantInfo: null })
})

describe('TenantCustomRenderer', () => {
  it('renders the field-key token muted + italic in design mode', () => {
    render(<TenantCustomRenderer element={makeEl()} resolveValues={false} />)
    const node = screen.getByText('{{fax}}')
    expect(node).toHaveStyle({ fontStyle: 'italic' })
  })

  it('renders a generic token in design mode when fieldKey is empty', () => {
    render(<TenantCustomRenderer element={makeEl({ fieldKey: '' })} resolveValues={false} />)
    expect(screen.getByText('{{fieldKey}}')).toBeInTheDocument()
  })

  it('resolves the custom field value from tenant info', () => {
    useReportStore.setState({ tenantInfo: { custom: { fax: '03-9999-0000' } } })
    render(<TenantCustomRenderer element={makeEl()} resolveValues={true} />)
    const node = screen.getByText('03-9999-0000')
    expect(node).toHaveStyle({ fontStyle: 'normal' })
  })

  it('prefers element fallback over the keyed 未設定 text', () => {
    render(<TenantCustomRenderer element={makeEl({ fallback: 'FAX なし' })} resolveValues={true} />)
    expect(screen.getByText('FAX なし')).toBeInTheDocument()
  })

  it('shows the keyed 未設定 fallback when the custom field is missing', () => {
    render(<TenantCustomRenderer element={makeEl()} resolveValues={true} />)
    expect(screen.getByText('（fax 未設定）')).toBeInTheDocument()
  })

  it('shows キー未設定 in resolve mode when fieldKey is empty', () => {
    render(<TenantCustomRenderer element={makeEl({ fieldKey: '' })} resolveValues={true} />)
    expect(screen.getByText('（キー未設定）')).toBeInTheDocument()
  })
})
