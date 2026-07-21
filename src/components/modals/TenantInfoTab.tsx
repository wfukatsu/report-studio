import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import type { TenantInfo } from '@/types'
import { TenantLogoField } from '@/components/common/TenantLogoField'
import { PropRow } from '@/elements/_base/sharedUI'

const MAX_CUSTOM_FIELDS = 20

export function TenantInfoTab() {
  const { t } = useTranslation('modals')
  const tenantInfo = useReportStore((s) => s.tenantInfo)
  const updateTenantInfo = useReportStore((s) => s.updateTenantInfo)
  const tenantLoading = useReportStore((s) => s.tenantLoading)

  // Local form state — initialized from store, saved on submit
  const [form, setForm] = useState<TenantInfo>(() => tenantInfo ?? {})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const customEntries = Object.entries(form.custom ?? {})

  function setField<K extends keyof TenantInfo>(key: K, value: TenantInfo[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addCustomField() {
    if (customEntries.length >= MAX_CUSTOM_FIELDS) return
    const newKey = `field${customEntries.length + 1}`
    setField('custom', { ...(form.custom ?? {}), [newKey]: '' })
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
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await updateTenantInfo(form)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('tenantInfoTab.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (tenantLoading) {
    return <div className="p-6 text-xs text-muted-foreground">{t('tenantInfoTab.loading')}</div>
  }

  return (
    <div className="p-4 flex flex-col gap-6">

      {/* Basic info */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('tenantInfoTab.basicInfo')}</p>
        <div className="flex flex-col gap-2">
          <PropRow label={t('tenantInfoTab.companyName')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder={t('tenantInfoTab.companyNamePlaceholder')}
              value={form.companyName ?? ''}
              onChange={(e) => setField('companyName', e.target.value)}
            />
          </PropRow>
          <PropRow label={t('tenantInfoTab.representativeName')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder={t('tenantInfoTab.representativeNamePlaceholder')}
              value={form.representativeName ?? ''}
              onChange={(e) => setField('representativeName', e.target.value)}
            />
          </PropRow>
          <PropRow label={t('tenantInfoTab.postalCode')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="100-0001"
              value={form.postalCode ?? ''}
              onChange={(e) => setField('postalCode', e.target.value)}
            />
          </PropRow>
          <PropRow label={t('tenantInfoTab.address1')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder={t('tenantInfoTab.address1Placeholder')}
              value={form.address1 ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setForm((prev) => ({ ...prev, address1: v, address: v + (prev.address2 ?? '') }))
              }}
            />
          </PropRow>
          <PropRow label={t('tenantInfoTab.address2')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder={t('tenantInfoTab.address2Placeholder')}
              value={form.address2 ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setForm((prev) => ({ ...prev, address2: v, address: (prev.address1 ?? '') + v }))
              }}
            />
          </PropRow>
          <PropRow label={t('tenantInfoTab.phone')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="03-1234-5678"
              value={form.phone ?? ''}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </PropRow>
          <PropRow label={t('tenantInfoTab.email')}>
            <input
              type="email"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="info@example.com"
              value={form.email ?? ''}
              onChange={(e) => setField('email', e.target.value)}
            />
          </PropRow>
        </div>
      </section>

      {/* Logo */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('tenantInfoTab.logo')}</p>
        <TenantLogoField
          value={form.logoBase64}
          onChange={(dataUrl) => setField('logoBase64', dataUrl)}
        />
      </section>

      {/* Custom fields */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tenantInfoTab.customFields')}</p>
          <button
            type="button"
            disabled={customEntries.length >= MAX_CUSTOM_FIELDS}
            onClick={addCustomField}
            className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('tenantInfoTab.add')}
          </button>
        </div>
        {customEntries.length === 0 && (
          <p className="text-[10px] text-muted-foreground">{t('tenantInfoTab.noCustomFields')}</p>
        )}
        {customEntries.map(([key, value]) => (
          <div key={key} className="flex gap-1 mb-1 items-center">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-1/3 bg-background font-mono"
              placeholder={t('tenantInfoTab.fieldNamePlaceholder')}
              value={key}
              onChange={(e) => updateCustomKey(key, e.target.value)}
            />
            <span className="text-muted-foreground text-xs">:</span>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs flex-1 bg-background"
              placeholder={t('tenantInfoTab.valuePlaceholder')}
              value={value}
              onChange={(e) => updateCustomValue(key, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeCustomField(key)}
              className="text-xs text-red-400 hover:text-red-600 px-1"
              aria-label={t('tenantInfoTab.removeFieldLabel')}
            >
              ✕
            </button>
          </div>
        ))}
        {customEntries.length >= MAX_CUSTOM_FIELDS && (
          <p className="text-[10px] text-muted-foreground mt-1">{t('tenantInfoTab.maxFields', { max: MAX_CUSTOM_FIELDS })}</p>
        )}
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60"
        >
          {saving ? t('tenantInfoTab.saving') : t('tenantInfoTab.save')}
        </button>
        {saveSuccess && <span className="text-xs text-green-600">{t('tenantInfoTab.saved')}</span>}
        {saveError && <span className="text-xs text-red-500">{saveError}</span>}
      </div>
    </div>
  )
}
