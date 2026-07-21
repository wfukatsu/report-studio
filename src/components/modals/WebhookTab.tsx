import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store'
import { getWebhookConfig, updateWebhookConfig, testWebhook } from '@/api/reportApi'
import type { WebhookConfig } from '@/api/reportApi'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'

export function WebhookTab() {
  const { t } = useTranslation('modals')
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)
  const [config, setConfig] = useState<WebhookConfig>({ url: '', secret: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadError, setLoadError] = useState<UserFacingError | null>(null)

  // Retry handler (event) — clears the error immediately for instant feedback.
  const loadConfig = useCallback(async () => {
    if (!currentTemplateId) return
    setLoadError(null)
    try {
      const cfg = await getWebhookConfig(currentTemplateId)
      setConfig({ url: cfg.url ?? '', secret: cfg.secret ?? '' })
    } catch (err) {
      setLoadError(classifyError(err))
    }
  }, [currentTemplateId])

  // Initial fetch — state updates happen only in the promise callbacks so the
  // effect body performs no synchronous setState.
  useEffect(() => {
    if (!currentTemplateId) return
    getWebhookConfig(currentTemplateId)
      .then((cfg) => {
        setConfig({ url: cfg.url ?? '', secret: cfg.secret ?? '' })
        setLoadError(null)
      })
      .catch((err) => setLoadError(classifyError(err)))
  }, [currentTemplateId])

  const handleSave = async () => {
    if (!currentTemplateId || saving) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await updateWebhookConfig(currentTemplateId, config)
      setSaveMsg({ ok: true, text: t('webhookTab.saved') })
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : t('webhookTab.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!currentTemplateId || testing) return
    setTesting(true)
    setTestMsg(null)
    try {
      const result = await testWebhook(currentTemplateId)
      setTestMsg({ ok: result.delivered, text: t('webhookTab.testSuccess', { url: result.url }) })
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : t('webhookTab.sendFailed') })
    } finally {
      setTesting(false)
    }
  }

  if (!currentTemplateId) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">{t('webhookTab.title')}</p>
        <p>{t('webhookTab.openTemplateHint')}</p>
        <p className="mt-1 text-[10px]">{t('webhookTab.openTemplateSteps')}</p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {t('webhookTab.title')}
        </p>
        <p className="text-[10px] text-muted-foreground mb-3">
          {t('webhookTab.descriptionLine1')}<br />
          <code className="bg-muted px-1 rounded">https://</code>{t('webhookTab.descriptionLine2')}
        </p>
      </div>

      {loadError && (
        <InlineErrorBanner error={loadError} onRetry={loadConfig} />
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">{t('webhookTab.webhookUrl')}</label>
        <input
          value={config.url ?? ''}
          onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
          placeholder="https://hooks.slack.com/..."
          className="border rounded px-2 py-1 text-xs bg-background"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">
          {t('webhookTab.secret')} <span className="text-muted-foreground font-normal">{t('webhookTab.optional')}</span>
        </label>
        <input
          type="password"
          value={config.secret === '****' ? '' : (config.secret ?? '')}
          onChange={e => setConfig(c => ({ ...c, secret: e.target.value }))}
          placeholder={t('webhookTab.secretPlaceholder')}
          className="border rounded px-2 py-1 text-xs bg-background"
        />
        <p className="text-[10px] text-muted-foreground">
          {t('webhookTab.signaturePrefix')}<code className="bg-muted px-0.5 rounded">X-Webhook-Signature</code>{t('webhookTab.signatureSuffix')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {saving ? t('webhookTab.saving') : t('webhookTab.save')}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !config.url}
          className="px-3 py-1.5 text-xs border rounded hover:bg-accent disabled:opacity-40 transition-colors"
        >
          {testing ? t('webhookTab.testing') : t('webhookTab.testSend')}
        </button>
      </div>

      {saveMsg && (
        <p className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{saveMsg.text}</p>
      )}
      {testMsg && (
        <p className={`text-xs ${testMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{testMsg.text}</p>
      )}

      <div className="border-t pt-3">
        <p className="text-[10px] text-muted-foreground font-medium mb-1">{t('webhookTab.payloadExample')}</p>
        <pre className="text-[9px] bg-muted p-2 rounded overflow-x-auto">{`{
  "event": "form_response.received",
  "templateId": "...",
  "responseId": "...",
  "submittedBy": "user@example.com",
  "data": { ... }
}`}</pre>
      </div>
    </div>
  )
}
