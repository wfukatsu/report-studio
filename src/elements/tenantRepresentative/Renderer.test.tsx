import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TenantRepresentativeRenderer } from './Renderer'
import type { TenantRepresentativeElement } from '@/types'

const el = {
  id: 't', type: 'tenantRepresentative',
  position: { x: 0, y: 0 }, size: { width: 60, height: 10 },
  zIndex: 0, visible: true, locked: false, style: {},
} as unknown as TenantRepresentativeElement

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ tenantInfo: null })
})

describe('TenantRepresentativeRenderer', () => {
  it('renders the {{代表者名}} placeholder muted + italic in design mode', () => {
    render(<TenantRepresentativeRenderer element={el} resolveValues={false} />)
    const node = screen.getByText('{{代表者名}}')
    expect(node).toHaveStyle({ fontStyle: 'italic' })
  })

  it('resolves representativeName from tenant info', () => {
    useReportStore.setState({ tenantInfo: { representativeName: '山田 太郎' } })
    render(<TenantRepresentativeRenderer element={el} resolveValues={true} />)
    const node = screen.getByText('山田 太郎')
    expect(node).toHaveStyle({ fontStyle: 'normal' })
  })

  it('prefers element fallback over the default 未設定 text', () => {
    const fallbackEl = { ...el, fallback: '代表 未登録' } as unknown as TenantRepresentativeElement
    render(<TenantRepresentativeRenderer element={fallbackEl} resolveValues={true} />)
    expect(screen.getByText('代表 未登録')).toBeInTheDocument()
  })

  it('renders nothing without tenant info and fallback (#315)', () => {
    const { container } = render(<TenantRepresentativeRenderer element={el} resolveValues={true} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('{{代表者名}}')).not.toBeInTheDocument()
  })
})
