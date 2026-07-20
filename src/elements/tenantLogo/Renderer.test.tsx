import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TenantLogoRenderer } from './Renderer'
import type { TenantLogoElement } from '@/types'

// 1×1 transparent PNG
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const el = {
  id: 't', type: 'tenantLogo', objectFit: 'contain',
  position: { x: 0, y: 0 }, size: { width: 40, height: 20 },
  zIndex: 0, visible: true, locked: false, style: {},
} as unknown as TenantLogoElement

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.setState({ tenantInfo: null })
})

describe('TenantLogoRenderer', () => {
  it('shows the ロゴ未設定 placeholder box without tenant logo', () => {
    render(<TenantLogoRenderer element={el} />)
    expect(screen.getByText(/ロゴ未設定/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders an <img> for a safe data-URI logo', () => {
    useReportStore.setState({ tenantInfo: { logoBase64: PNG_DATA_URI } })
    render(<TenantLogoRenderer element={el} />)
    const img = screen.getByRole('img', { name: '会社ロゴ' })
    expect(img).toHaveAttribute('src', PNG_DATA_URI)
  })

  it('applies objectFit and opacity from the element', () => {
    useReportStore.setState({ tenantInfo: { logoBase64: PNG_DATA_URI } })
    const styled = { ...el, objectFit: 'cover', opacity: 0.5 } as unknown as TenantLogoElement
    render(<TenantLogoRenderer element={styled} />)
    const img = screen.getByRole('img', { name: '会社ロゴ' })
    expect(img).toHaveStyle({ objectFit: 'cover', opacity: '0.5' })
  })

  it('falls back to the placeholder for an unsafe (non-image) src', () => {
    useReportStore.setState({
      tenantInfo: { logoBase64: 'javascript:alert(1)' },
    })
    render(<TenantLogoRenderer element={el} />)
    expect(screen.getByText(/ロゴ未設定/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
