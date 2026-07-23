import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import type { TaxType, TenantInfo } from '@/types'
import { TenantLogoField } from '@/components/common/TenantLogoField'
import { AlertBanner } from '@/components/common/AlertBanner'
import { resolveTaxRates } from '@/lib/taxRates'

// Editable tax types (「非課税」= none is always 0% and shown read-only).
const EDITABLE_TAX_TYPES: readonly TaxType[] = ['standard', 'reduced']

const MAX_CUSTOM_FIELDS = 20

// Lenient, non-blocking format checks — surface a hint but never disable save,
// so unusual/international values are still accepted (#332).
const POSTAL_RE = /^\d{3}-?\d{4}$/
const PHONE_RE = /^[\d\-+()\s]{10,}$/

interface Props {
  /** Optional heading rendered above the form (admin host shows it; the modal
   *  tab omits it since the modal already has its own title bar). */
  readonly heading?: string
  /** Fetch fresh tenant info on mount (admin host). The modal relies on the
   *  already-loaded store value. */
  readonly fetchOnMount?: boolean
}

/**
 * Single source of truth for the tenant-info edit form (#332).
 *
 * Previously duplicated across `modals/TenantInfoTab` and
 * `admin/TenantSettings` with diverging behavior; this component unifies the
 * *better* behavior of each: the derived-state `isDirty` unsaved detection
 * (from TenantSettings) **and** custom-field editing (from TenantInfoTab), plus
 * a single address-composition path and lightweight validation hints. Hosts
 * differ only by the two presentational props above.
 */
export function TenantInfoForm({ heading, fetchOnMount }: Props) {
  const { t } = useTranslation('components')
  const tenantInfo = useReportStore((s) => s.tenantInfo)
  const tenantLoading = useReportStore((s) => s.tenantLoading)
  const fetchTenantInfo = useReportStore((s) => s.fetchTenantInfo)
  const updateTenantInfo = useReportStore((s) => s.updateTenantInfo)

  // Derived form state: unedited fields mirror the store; `edited` holds the
  // working copy once the user starts typing (no setState-in-effect sync).
  const [edited, setEdited] = useState<TenantInfo | null>(null)
  const form: TenantInfo = edited ?? tenantInfo ?? {}
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(tenantInfo ?? {})
  const customEntries = Object.entries(form.custom ?? {})
  const effectiveRates = resolveTaxRates(form)

  const postalInvalid = !!form.postalCode?.trim() && !POSTAL_RE.test(form.postalCode.trim())
  const phoneInvalid = !!form.phone?.trim() && !PHONE_RE.test(form.phone.trim())

  useEffect(() => {
    if (fetchOnMount) void fetchTenantInfo()
  }, [fetchOnMount, fetchTenantInfo])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function setField<K extends keyof TenantInfo>(key: K, value: TenantInfo[K]) {
    setEdited({ ...form, [key]: value })
  }

  // address1 + address2 → composed `address` (single path shared by both hosts).
  function setAddress(part: 'address1' | 'address2', value: string) {
    const a1 = part === 'address1' ? value : (form.address1 ?? '')
    const a2 = part === 'address2' ? value : (form.address2 ?? '')
    setEdited({ ...form, [part]: value, address: a1 + a2 })
  }

  // Tax rates are edited as percentages but stored as decimal fractions (#333).
  // Blank/invalid clears the override so the statutory default applies again.
  function setTaxRatePercent(type: TaxType, raw: string) {
    const next = { ...(form.taxRates ?? {}) }
    const pct = parseFloat(raw)
    if (raw.trim() === '' || !isFinite(pct)) delete next[type]
    else next[type] = pct / 100
    setField('taxRates', next)
  }

  function addCustomField() {
    if (customEntries.length >= MAX_CUSTOM_FIELDS) return
    setField('custom', { ...(form.custom ?? {}), [`field${customEntries.length + 1}`]: '' })
  }

  function updateCustomKey(oldKey: string, newKey: string) {
    const current = { ...(form.custom ?? {}) }
    const value = current[oldKey] ?? ''
    delete current[oldKey]
    current[newKey] = value
    setField('custom', current)
  }

  function updateCustomValue(key: string, value: string) {
    setField('custom', { ...(form.custom ?? {}), [key]: value })
  }

  function removeCustomField(key: string) {
    const current = { ...(form.custom ?? {}) }
    delete current[key]
    setField('custom', current)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveMessage(null)
    try {
      await updateTenantInfo(form)
      // Store now holds the server-normalized value — drop the working copy so
      // the form mirrors it again and isDirty clears.
      setEdited(null)
      setSaveMessage(t('tenantInfoForm.saved'))
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tenantInfoForm.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (tenantLoading && !tenantInfo) {
    return <div className="p-6 text-xs text-muted-foreground">{t('tenantInfoForm.loading')}</div>
  }

  const fieldClass = 'border rounded px-2 py-1 text-xs w-full bg-background'
  const labelClass = 'text-xs text-muted-foreground block mb-1'

  return (
    <div className="p-4 flex flex-col gap-6">
      {(heading || isDirty) && (
        <div className="flex items-center gap-2">
          {heading && <h2 className="text-sm font-semibold text-foreground">{heading}</h2>}
          {isDirty && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              {t('tenantInfoForm.unsavedChanges')}
            </span>
          )}
        </div>
      )}

      {error && <AlertBanner variant="error" message={error} />}
      {saveMessage && <AlertBanner variant="success" message={saveMessage} />}

      {/* Basic info */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('tenantInfoForm.basicInfo')}</p>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelClass}>{t('tenantInfoForm.companyName')}</label>
            <input
              type="text"
              className={fieldClass}
              placeholder={t('tenantInfoForm.companyNamePlaceholder')}
              value={form.companyName ?? ''}
              onChange={(e) => setField('companyName', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>{t('tenantInfoForm.representativeName')}</label>
            <input
              type="text"
              className={fieldClass}
              placeholder={t('tenantInfoForm.representativeNamePlaceholder')}
              value={form.representativeName ?? ''}
              onChange={(e) => setField('representativeName', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>{t('tenantInfoForm.postalCode')}</label>
            <input
              type="text"
              className={fieldClass}
              placeholder="100-0001"
              value={form.postalCode ?? ''}
              onChange={(e) => setField('postalCode', e.target.value)}
            />
            {postalInvalid && <p className="text-[10px] text-amber-600 mt-1">{t('tenantInfoForm.postalCodeHint')}</p>}
          </div>
          <div>
            <label className={labelClass}>{t('tenantInfoForm.address1')}</label>
            <input
              type="text"
              className={fieldClass}
              placeholder={t('tenantInfoForm.address1Placeholder')}
              value={form.address1 ?? ''}
              onChange={(e) => setAddress('address1', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>{t('tenantInfoForm.address2')}</label>
            <input
              type="text"
              className={fieldClass}
              placeholder={t('tenantInfoForm.address2Placeholder')}
              value={form.address2 ?? ''}
              onChange={(e) => setAddress('address2', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>{t('tenantInfoForm.phone')}</label>
            <input
              type="text"
              className={fieldClass}
              placeholder="03-1234-5678"
              value={form.phone ?? ''}
              onChange={(e) => setField('phone', e.target.value)}
            />
            {phoneInvalid && <p className="text-[10px] text-amber-600 mt-1">{t('tenantInfoForm.phoneHint')}</p>}
          </div>
          <div>
            <label className={labelClass}>{t('tenantInfoForm.email')}</label>
            <input
              type="email"
              className={fieldClass}
              placeholder="info@example.com"
              value={form.email ?? ''}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Logo */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('tenantInfoForm.logo')}</p>
        <TenantLogoField value={form.logoBase64} onChange={(dataUrl) => setField('logoBase64', dataUrl)} />
      </section>

      {/* Tax rates — single source of truth referenced from calc expressions (#333) */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('tenantInfoForm.taxRates')}</p>
        <p className="text-[10px] text-muted-foreground mb-3">{t('tenantInfoForm.taxRatesHint')}</p>
        <div className="flex flex-wrap gap-3">
          {EDITABLE_TAX_TYPES.map((type) => (
            <div key={type}>
              <label className={labelClass}>{t(`tenantInfoForm.taxType.${type}`)}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className="border rounded px-2 py-1 text-xs w-24 bg-background text-right"
                  aria-label={t(`tenantInfoForm.taxType.${type}`)}
                  value={Number((effectiveRates[type] * 100).toFixed(4))}
                  onChange={(e) => setTaxRatePercent(type, e.target.value)}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}
          <div>
            <label className={labelClass}>{t('tenantInfoForm.taxType.none')}</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                className="border rounded px-2 py-1 text-xs w-24 bg-background text-right text-muted-foreground"
                value={0}
                disabled
                aria-label={t('tenantInfoForm.taxType.none')}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Custom fields — now available in both hosts (#332) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tenantInfoForm.customFields')}</p>
          <button
            type="button"
            disabled={customEntries.length >= MAX_CUSTOM_FIELDS}
            onClick={addCustomField}
            className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('tenantInfoForm.add')}
          </button>
        </div>
        {customEntries.length === 0 && (
          <p className="text-[10px] text-muted-foreground">{t('tenantInfoForm.noCustomFields')}</p>
        )}
        {customEntries.map(([key, value]) => (
          <div key={key} className="flex gap-1 mb-1 items-center">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-1/3 bg-background font-mono"
              placeholder={t('tenantInfoForm.fieldNamePlaceholder')}
              value={key}
              onChange={(e) => updateCustomKey(key, e.target.value)}
            />
            <span className="text-muted-foreground text-xs">:</span>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs flex-1 bg-background"
              placeholder={t('tenantInfoForm.valuePlaceholder')}
              value={value}
              onChange={(e) => updateCustomValue(key, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeCustomField(key)}
              className="text-xs text-red-400 hover:text-red-600 px-1"
              aria-label={t('tenantInfoForm.removeFieldLabel')}
            >
              ✕
            </button>
          </div>
        ))}
        {customEntries.length >= MAX_CUSTOM_FIELDS && (
          <p className="text-[10px] text-muted-foreground mt-1">{t('tenantInfoForm.maxFields', { max: MAX_CUSTOM_FIELDS })}</p>
        )}
      </section>

      {/* Save */}
      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 w-fit"
        >
          {saving ? t('tenantInfoForm.saving') : t('tenantInfoForm.save')}
        </button>
      </div>
    </div>
  )
}
