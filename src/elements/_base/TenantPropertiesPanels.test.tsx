/**
 * Tests for all tenant-info element PropertiesPanel components.
 * Verifies that user edits produce the correct onChange patches.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentType } from 'react'
import { TenantCompanyNamePropertiesPanel } from '@/elements/tenantCompanyName/PropertiesPanel'
import { TenantAddressPropertiesPanel } from '@/elements/tenantAddress/PropertiesPanel'
import { TenantPhonePropertiesPanel } from '@/elements/tenantPhone/PropertiesPanel'
import { TenantRepresentativePropertiesPanel } from '@/elements/tenantRepresentative/PropertiesPanel'
import { TenantLogoPropertiesPanel } from '@/elements/tenantLogo/PropertiesPanel'
import { TenantCustomPropertiesPanel } from '@/elements/tenantCustom/PropertiesPanel'
import {
  createTenantCompanyNameElement,
  createTenantAddressElement,
  createTenantPhoneElement,
  createTenantRepresentativeElement,
  createTenantLogoElement,
  createTenantCustomElement,
} from '@/lib/elementFactories'
import type {
  TenantAddressElement,
  TenantLogoElement,
  TenantCustomElement,
} from '@/types'

// ---------------------------------------------------------------------------
// Parametrized: fallback input + text style section (text-based panels)
// ---------------------------------------------------------------------------

interface PanelCase {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Panel: ComponentType<any>
  makeElement: () => unknown
  fallbackPlaceholder: string
}

const PANEL_CASES: PanelCase[] = [
  {
    label: 'TenantCompanyNamePropertiesPanel',
    Panel: TenantCompanyNamePropertiesPanel,
    makeElement: () => createTenantCompanyNameElement(),
    fallbackPlaceholder: '（会社名未設定）',
  },
  {
    label: 'TenantAddressPropertiesPanel',
    Panel: TenantAddressPropertiesPanel,
    makeElement: () => createTenantAddressElement(),
    fallbackPlaceholder: '（住所未設定）',
  },
  {
    label: 'TenantPhonePropertiesPanel',
    Panel: TenantPhonePropertiesPanel,
    makeElement: () => createTenantPhoneElement(),
    fallbackPlaceholder: '（電話番号未設定）',
  },
  {
    label: 'TenantRepresentativePropertiesPanel',
    Panel: TenantRepresentativePropertiesPanel,
    makeElement: () => createTenantRepresentativeElement(),
    fallbackPlaceholder: '（代表者名未設定）',
  },
  {
    label: 'TenantCustomPropertiesPanel',
    Panel: TenantCustomPropertiesPanel,
    makeElement: () => createTenantCustomElement(),
    fallbackPlaceholder: '（未設定）',
  },
]

describe.each(PANEL_CASES)('$label', ({ Panel, makeElement, fallbackPlaceholder }) => {
  it('emits a fallback patch when the fallback text changes', () => {
    const onChange = vi.fn()
    render(<Panel el={makeElement()} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText(fallbackPlaceholder), { target: { value: '未登録' } })
    expect(onChange).toHaveBeenCalledWith({ fallback: '未登録' })
  })

  it('clears the fallback with undefined when the input is emptied', () => {
    const onChange = vi.fn()
    render(<Panel el={{ ...(makeElement() as object), fallback: 'x' }} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText(fallbackPlaceholder), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ fallback: undefined })
  })

  it('emits a merged style patch from the text style section', () => {
    const onChange = vi.fn()
    render(<Panel el={makeElement()} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('太字'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const patch = onChange.mock.calls[0][0]
    expect(patch.style).toBeDefined()
    expect(Object.keys(patch)).toEqual(['style'])
  })
})

// ---------------------------------------------------------------------------
// Panel-specific behavior
// ---------------------------------------------------------------------------

describe('TenantAddressPropertiesPanel — display mode', () => {
  it('emits a displayMode patch when the mode is switched', () => {
    const onChange = vi.fn()
    const el = createTenantAddressElement() as TenantAddressElement
    render(<TenantAddressPropertiesPanel el={el} onChange={onChange} />)
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: 'multiLine' } })
    expect(onChange).toHaveBeenCalledWith({ displayMode: 'multiLine' })
  })
})

describe('TenantCustomPropertiesPanel — field key', () => {
  it('emits a fieldKey patch when the key changes', () => {
    const onChange = vi.fn()
    const el = createTenantCustomElement() as TenantCustomElement
    render(<TenantCustomPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText('例: taxRegistrationNumber'), {
      target: { value: 'taxId' },
    })
    expect(onChange).toHaveBeenCalledWith({ fieldKey: 'taxId' })
  })
})

describe('TenantLogoPropertiesPanel', () => {
  it('emits an objectFit patch when the fit mode changes', () => {
    const onChange = vi.fn()
    const el = createTenantLogoElement() as TenantLogoElement
    render(<TenantLogoPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cover' } })
    expect(onChange).toHaveBeenCalledWith({ objectFit: 'cover' })
  })

  it('emits a numeric opacity patch from the slider and shows the percentage', () => {
    const onChange = vi.fn()
    const el = { ...(createTenantLogoElement() as TenantLogoElement), opacity: 0.75 }
    render(<TenantLogoPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.5' } })
    expect(onChange).toHaveBeenCalledWith({ opacity: 0.5 })
  })
})
