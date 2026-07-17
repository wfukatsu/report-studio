/**
 * Tests for all tenant-info element renderers.
 *
 * These renderers resolve values from `useReportStore().tenantInfo`:
 * - design mode (resolveValues=false): show a {{token}} placeholder
 * - preview/export mode (resolveValues=true): show the tenant value,
 *   the element fallback, or a "not configured" placeholder — in that order.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { useReportStore } from '@/store'
import { TenantCompanyNameRenderer } from '@/elements/tenantCompanyName/Renderer'
import { TenantAddressRenderer } from '@/elements/tenantAddress/Renderer'
import { TenantPhoneRenderer } from '@/elements/tenantPhone/Renderer'
import { TenantRepresentativeRenderer } from '@/elements/tenantRepresentative/Renderer'
import { TenantLogoRenderer } from '@/elements/tenantLogo/Renderer'
import { TenantCustomRenderer } from '@/elements/tenantCustom/Renderer'
import {
  createTenantCompanyNameElement,
  createTenantAddressElement,
  createTenantPhoneElement,
  createTenantRepresentativeElement,
  createTenantLogoElement,
  createTenantCustomElement,
} from '@/lib/elementFactories'
import type {
  TenantInfo,
  TenantAddressElement,
  TenantLogoElement,
  TenantCustomElement,
} from '@/types'

const TENANT_INFO: TenantInfo = {
  companyName: 'スカラー株式会社',
  postalCode: '100-0001',
  address1: '東京都千代田区',
  address2: '大手町1-1',
  phone: '03-1234-5678',
  representativeName: '山田 太郎',
  custom: { taxId: 'T1234567890123' },
}

function setTenantInfo(info: TenantInfo | null) {
  useReportStore.setState({ tenantInfo: info } as never)
}

beforeEach(() => {
  setTenantInfo(null)
})

// ---------------------------------------------------------------------------
// Parametrized: simple text renderers (companyName / phone / representative)
// ---------------------------------------------------------------------------

interface TextCase {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Renderer: ComponentType<any>
  makeElement: (overrides?: Record<string, unknown>) => unknown
  token: string
  resolvedValue: string
  placeholder: string
}

const TEXT_CASES: TextCase[] = [
  {
    label: 'TenantCompanyNameRenderer',
    Renderer: TenantCompanyNameRenderer,
    makeElement: (o) => createTenantCompanyNameElement(o),
    token: '{{会社名}}',
    resolvedValue: 'スカラー株式会社',
    placeholder: '（会社名未設定）',
  },
  {
    label: 'TenantPhoneRenderer',
    Renderer: TenantPhoneRenderer,
    makeElement: (o) => createTenantPhoneElement(o),
    token: '{{電話番号}}',
    resolvedValue: '03-1234-5678',
    placeholder: '（電話番号未設定）',
  },
  {
    label: 'TenantRepresentativeRenderer',
    Renderer: TenantRepresentativeRenderer,
    makeElement: (o) => createTenantRepresentativeElement(o),
    token: '{{代表者名}}',
    resolvedValue: '山田 太郎',
    placeholder: '（代表者名未設定）',
  },
]

describe.each(TEXT_CASES)('$label', ({ Renderer, makeElement, token, resolvedValue, placeholder }) => {
  it('shows the binding token in design mode', () => {
    setTenantInfo(TENANT_INFO)
    render(<Renderer element={makeElement()} />)
    expect(screen.getByText(token)).toBeInTheDocument()
    expect(screen.queryByText(resolvedValue)).not.toBeInTheDocument()
  })

  it('resolves the tenant value when resolveValues is set', () => {
    setTenantInfo(TENANT_INFO)
    render(<Renderer element={makeElement()} resolveValues />)
    expect(screen.getByText(resolvedValue)).toBeInTheDocument()
  })

  it('falls back to the element fallback when tenant info is missing', () => {
    render(<Renderer element={makeElement({ fallback: '未登録' })} resolveValues />)
    expect(screen.getByText('未登録')).toBeInTheDocument()
  })

  it('shows the not-configured placeholder without tenant info or fallback', () => {
    render(<Renderer element={makeElement()} resolveValues />)
    expect(screen.getByText(placeholder)).toBeInTheDocument()
  })

  it('applies the element text style over the default style', () => {
    setTenantInfo(TENANT_INFO)
    const { container } = render(
      <Renderer
        element={makeElement({ style: { color: '#ff0000', fontWeight: 'bold' } })}
        resolveValues
        defaultStyle={{ color: '#0000ff', fontStyle: 'italic' }}
      />,
    )
    // TextContent renders wrapper div > inner styled div
    const inner = container.firstElementChild!.firstElementChild as HTMLElement
    expect(inner.style.color).toBe('rgb(255, 0, 0)') // element wins
    expect(inner.style.fontWeight).toBe('bold')
    expect(inner.style.fontStyle).toBe('italic') // default fills the gap
  })
})

// ---------------------------------------------------------------------------
// TenantAddressRenderer — display modes
// ---------------------------------------------------------------------------

describe('TenantAddressRenderer', () => {
  const makeEl = (o?: Partial<TenantAddressElement>) =>
    createTenantAddressElement(o) as TenantAddressElement

  it('shows the {{住所}} token in design mode', () => {
    setTenantInfo(TENANT_INFO)
    render(<TenantAddressRenderer element={makeEl()} />)
    expect(screen.getByText('{{住所}}')).toBeInTheDocument()
  })

  it('formats a single-line address with postal code', () => {
    setTenantInfo(TENANT_INFO)
    render(<TenantAddressRenderer element={makeEl()} resolveValues />)
    expect(screen.getByText('〒100-0001 東京都千代田区大手町1-1')).toBeInTheDocument()
  })

  it('formats a multi-line address as newline-separated lines', () => {
    setTenantInfo(TENANT_INFO)
    const { container } = render(
      <TenantAddressRenderer element={makeEl({ displayMode: 'multiLine' })} resolveValues />,
    )
    expect(container.textContent).toBe('〒100-0001\n東京都千代田区\n大手町1-1')
  })

  it('treats the legacy single address field as address1', () => {
    setTenantInfo({ address: '大阪府大阪市北区1-2-3' })
    render(<TenantAddressRenderer element={makeEl()} resolveValues />)
    expect(screen.getByText('大阪府大阪市北区1-2-3')).toBeInTheDocument()
  })

  it('uses fallback, then the placeholder, when no address is configured', () => {
    const { unmount } = render(
      <TenantAddressRenderer element={makeEl({ fallback: '住所なし' })} resolveValues />,
    )
    expect(screen.getByText('住所なし')).toBeInTheDocument()
    unmount()

    render(<TenantAddressRenderer element={makeEl()} resolveValues />)
    expect(screen.getByText('（住所未設定）')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// TenantCustomRenderer — custom key/value fields
// ---------------------------------------------------------------------------

describe('TenantCustomRenderer', () => {
  const makeEl = (o?: Partial<TenantCustomElement>) =>
    createTenantCustomElement(o) as TenantCustomElement

  it('shows the field key as a token in design mode', () => {
    render(<TenantCustomRenderer element={makeEl({ fieldKey: 'taxId' })} />)
    expect(screen.getByText('{{taxId}}')).toBeInTheDocument()
  })

  it('shows a generic token when the field key is empty in design mode', () => {
    render(<TenantCustomRenderer element={makeEl()} />)
    expect(screen.getByText('{{fieldKey}}')).toBeInTheDocument()
  })

  it('resolves the custom field value from tenant info', () => {
    setTenantInfo(TENANT_INFO)
    render(<TenantCustomRenderer element={makeEl({ fieldKey: 'taxId' })} resolveValues />)
    expect(screen.getByText('T1234567890123')).toBeInTheDocument()
  })

  it('shows the key-specific placeholder when the key has no value', () => {
    setTenantInfo(TENANT_INFO)
    render(<TenantCustomRenderer element={makeEl({ fieldKey: 'branchCode' })} resolveValues />)
    expect(screen.getByText('（branchCode 未設定）')).toBeInTheDocument()
  })

  it('prefers the fallback over the placeholder', () => {
    render(
      <TenantCustomRenderer
        element={makeEl({ fieldKey: 'branchCode', fallback: '本店' })}
        resolveValues
      />,
    )
    expect(screen.getByText('本店')).toBeInTheDocument()
  })

  it('shows the no-key placeholder when the field key is empty', () => {
    render(<TenantCustomRenderer element={makeEl()} resolveValues />)
    expect(screen.getByText('（キー未設定）')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// TenantLogoRenderer — image resolution + safety
// ---------------------------------------------------------------------------

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('TenantLogoRenderer', () => {
  const makeEl = (o?: Partial<TenantLogoElement>) =>
    createTenantLogoElement(o) as TenantLogoElement

  it('shows the placeholder when no logo is configured', () => {
    render(<TenantLogoRenderer element={makeEl()} />)
    expect(screen.getByText(/ロゴ未設定/)).toBeInTheDocument()
  })

  it('renders the tenant logo image with objectFit and opacity applied', () => {
    setTenantInfo({ logoBase64: PNG_DATA_URI })
    render(<TenantLogoRenderer element={makeEl({ objectFit: 'cover', opacity: 0.5 })} />)
    const img = screen.getByRole('img', { name: '会社ロゴ' }) as HTMLImageElement
    expect(img.src).toBe(PNG_DATA_URI)
    expect(img.style.objectFit).toBe('cover')
    expect(img.style.opacity).toBe('0.5')
  })

  it('rejects unsafe image sources and falls back to the placeholder', () => {
    setTenantInfo({ logoBase64: 'data:text/html,<script>alert(1)</script>' })
    render(<TenantLogoRenderer element={makeEl()} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/ロゴ未設定/)).toBeInTheDocument()
  })
})
