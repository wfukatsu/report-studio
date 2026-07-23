import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store/reportStore'
import { TenantInfoForm } from './TenantInfoForm'
import { tk } from '@/test/i18n'

vi.mock('@/components/common/TenantLogoField', () => ({
  TenantLogoField: () => <div data-testid="logo-field" />,
}))

const ph = (k: string) => tk(`components:tenantInfoForm.${k}`)

function seedStore(over: Record<string, unknown> = {}) {
  useReportStore.setState({
    tenantInfo: {},
    tenantLoading: false,
    fetchTenantInfo: vi.fn().mockResolvedValue(undefined),
    updateTenantInfo: vi.fn().mockResolvedValue(undefined),
    ...over,
  })
}

describe('TenantInfoForm', () => {
  beforeEach(() => seedStore())

  it('renders basic fields seeded from the store', () => {
    seedStore({ tenantInfo: { companyName: 'Acme' } })
    render(<TenantInfoForm />)
    expect(screen.getByPlaceholderText(ph('companyNamePlaceholder'))).toHaveValue('Acme')
  })

  it('shows the unsaved badge and enables save only after an edit (isDirty)', () => {
    render(<TenantInfoForm />)
    const save = screen.getByRole('button', { name: ph('save') })
    expect(save).toBeDisabled()
    expect(screen.queryByText(ph('unsavedChanges'))).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(ph('companyNamePlaceholder')), { target: { value: 'Beta' } })
    expect(save).toBeEnabled()
    expect(screen.getByText(ph('unsavedChanges'))).toBeInTheDocument()
  })

  it('supports custom fields (add / edit / remove) in any host', () => {
    render(<TenantInfoForm />)
    expect(screen.getByText(ph('noCustomFields'))).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: ph('add') }))
    const keyInput = screen.getByPlaceholderText(ph('fieldNamePlaceholder'))
    expect(keyInput).toHaveValue('field1')

    fireEvent.change(screen.getByPlaceholderText(ph('valuePlaceholder')), { target: { value: '123' } })
    expect(screen.getByPlaceholderText(ph('valuePlaceholder'))).toHaveValue('123')

    fireEvent.click(screen.getByRole('button', { name: ph('removeFieldLabel') }))
    expect(screen.queryByPlaceholderText(ph('fieldNamePlaceholder'))).not.toBeInTheDocument()
  })

  it('shows tax rates as percentages, defaulting to the statutory rates', () => {
    render(<TenantInfoForm />)
    expect(screen.getByRole('spinbutton', { name: ph('taxType.standard') })).toHaveValue(10)
    expect(screen.getByRole('spinbutton', { name: ph('taxType.reduced') })).toHaveValue(8)
    // 非課税 is fixed at 0% and read-only
    expect(screen.getByRole('spinbutton', { name: ph('taxType.none') })).toBeDisabled()
  })

  it('edits a tax rate as a percentage and stores it as a decimal fraction', async () => {
    const updateTenantInfo = vi.fn().mockResolvedValue(undefined)
    seedStore({ updateTenantInfo })
    render(<TenantInfoForm />)
    fireEvent.change(screen.getByRole('spinbutton', { name: ph('taxType.standard') }), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: ph('save') }))
    await waitFor(() => expect(updateTenantInfo).toHaveBeenCalled())
    expect(updateTenantInfo.mock.calls[0][0].taxRates).toMatchObject({ standard: 0.12 })
  })

  it('composes address1 + address2 into a single address on save', async () => {
    const updateTenantInfo = vi.fn().mockResolvedValue(undefined)
    seedStore({ updateTenantInfo })
    render(<TenantInfoForm />)
    fireEvent.change(screen.getByPlaceholderText(ph('address1Placeholder')), { target: { value: '東京都' } })
    fireEvent.change(screen.getByPlaceholderText(ph('address2Placeholder')), { target: { value: '1-1-1' } })
    fireEvent.click(screen.getByRole('button', { name: ph('save') }))
    await waitFor(() => expect(updateTenantInfo).toHaveBeenCalled())
    expect(updateTenantInfo.mock.calls[0][0]).toMatchObject({ address1: '東京都', address2: '1-1-1', address: '東京都1-1-1' })
  })

  it('saves, clears dirty, and shows a success message', async () => {
    render(<TenantInfoForm />)
    fireEvent.change(screen.getByPlaceholderText(ph('companyNamePlaceholder')), { target: { value: 'Beta' } })
    fireEvent.click(screen.getByRole('button', { name: ph('save') }))
    await waitFor(() => expect(screen.getByText(ph('saved'))).toBeInTheDocument())
    // isDirty cleared → badge gone, save disabled again
    expect(screen.queryByText(ph('unsavedChanges'))).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: ph('save') })).toBeDisabled()
  })

  it('surfaces a non-blocking hint for an invalid postal code without disabling save', () => {
    render(<TenantInfoForm />)
    fireEvent.change(screen.getByPlaceholderText('100-0001'), { target: { value: 'abc' } })
    expect(screen.getByText(ph('postalCodeHint'))).toBeInTheDocument()
    // still saveable (dirty) — validation is advisory only
    expect(screen.getByRole('button', { name: ph('save') })).toBeEnabled()
  })

  it('renders the heading and fetches on mount when hosted in admin', () => {
    const fetchTenantInfo = vi.fn().mockResolvedValue(undefined)
    seedStore({ fetchTenantInfo })
    render(<TenantInfoForm heading="テナント情報" fetchOnMount />)
    expect(screen.getByRole('heading', { name: 'テナント情報' })).toBeInTheDocument()
    expect(fetchTenantInfo).toHaveBeenCalled()
  })

  it('does not fetch on mount without the flag (modal host)', () => {
    const fetchTenantInfo = vi.fn().mockResolvedValue(undefined)
    seedStore({ fetchTenantInfo })
    render(<TenantInfoForm />)
    expect(fetchTenantInfo).not.toHaveBeenCalled()
  })
})
