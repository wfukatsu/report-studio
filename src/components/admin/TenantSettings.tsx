import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import { AlertBanner } from '@/components/common/AlertBanner'
import { TenantLogoField } from '@/components/common/TenantLogoField'
import type { TenantInfo } from '@/types'

export function TenantSettings() {
  const { t } = useTranslation('components')
  const tenantInfo = useReportStore((s) => s.tenantInfo)
  const fetchTenantInfo = useReportStore((s) => s.fetchTenantInfo)
  const updateTenantInfo = useReportStore((s) => s.updateTenantInfo)

  // The form is derived: unedited fields mirror the store's tenantInfo, and
  // `edited` holds the user's working copy once they start typing. This
  // replaces the old store→form sync effect (no setState in effects).
  const [edited, setEdited] = useState<TenantInfo | null>(null)
  const form: TenantInfo = edited ?? tenantInfo ?? {}
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(tenantInfo ?? {})

  useEffect(() => {
    void fetchTenantInfo()
  }, [fetchTenantInfo])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function setField<K extends keyof TenantInfo>(key: K, value: TenantInfo[K]) {
    setEdited({ ...form, [key]: value })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveMessage(null)
    try {
      await updateTenantInfo(form)
      // The store now holds the server-normalized tenantInfo — drop the local
      // working copy so the form mirrors it again (and isDirty clears).
      setEdited(null)
      setSaveMessage(t('admin.tenantSettings.saveSuccess'))
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSaveMessage(null), 3000)
    } catch {
      setError(t('admin.tenantSettings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t('admin.tenantSettings.title')}</h2>
        {isDirty && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            {t('admin.tenantSettings.unsavedChanges')}
          </span>
        )}
      </div>

      {error && <AlertBanner variant="error" message={error} />}
      {saveMessage && <AlertBanner variant="success" message={saveMessage} />}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.companyName')}</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={form.companyName ?? ''}
            onChange={(e) => setField('companyName', e.target.value)}
            placeholder={t('admin.tenantSettings.companyNamePlaceholder')}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.postalCode')}</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={form.postalCode ?? ''}
            onChange={(e) => setField('postalCode', e.target.value)}
            placeholder="123-4567"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.address1')}</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={form.address1 ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setEdited({ ...form, address1: v, address: v + (form.address2 ?? '') })
            }}
            placeholder={t('admin.tenantSettings.address1Placeholder')}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.address2')}</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={form.address2 ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setEdited({ ...form, address2: v, address: (form.address1 ?? '') + v })
            }}
            placeholder={t('admin.tenantSettings.address2Placeholder')}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.phone')}</label>
            <input
              type="text"
              className="border rounded px-3 py-1.5 text-sm w-full bg-background"
              value={form.phone ?? ''}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="03-1234-5678"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.email')}</label>
            <input
              type="email"
              className="border rounded px-3 py-1.5 text-sm w-full bg-background"
              value={form.email ?? ''}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="info@example.com"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.representativeName')}</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={form.representativeName ?? ''}
            onChange={(e) => setField('representativeName', e.target.value)}
            placeholder={t('admin.tenantSettings.representativeNamePlaceholder')}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('admin.tenantSettings.logo')}</label>
          <TenantLogoField
            value={form.logoBase64}
            onChange={(dataUrl) => setField('logoBase64', dataUrl)}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 w-fit"
      >
        {saving ? t('admin.tenantSettings.saving') : t('admin.tenantSettings.save')}
      </button>
    </div>
  )
}
