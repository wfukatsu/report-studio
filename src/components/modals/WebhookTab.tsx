import { useEffect, useState, useCallback } from 'react'
import { useReportStore } from '@/store'
import { getWebhookConfig, updateWebhookConfig, testWebhook } from '@/api/reportApi'
import type { WebhookConfig } from '@/api/reportApi'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'

export function WebhookTab() {
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)
  const [config, setConfig] = useState<WebhookConfig>({ url: '', secret: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadError, setLoadError] = useState<UserFacingError | null>(null)

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

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleSave = async () => {
    if (!currentTemplateId || saving) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await updateWebhookConfig(currentTemplateId, config)
      setSaveMsg({ ok: true, text: '保存しました' })
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : '保存に失敗しました' })
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
      setTestMsg({ ok: result.delivered, text: `テスト送信成功 → ${result.url}` })
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : '送信に失敗しました' })
    } finally {
      setTesting(false)
    }
  }

  if (!currentTemplateId) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Webhook設定</p>
        <p>サーバーからテンプレートを開くとWebhookを設定できます。</p>
        <p className="mt-1 text-[10px]">（「開く」→「サーバーから開く」→テンプレートを選択）</p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Webhook設定
        </p>
        <p className="text-[10px] text-muted-foreground mb-3">
          フォーム回答が送信されるたびに指定URLへHTTP POSTを送信します。<br />
          <code className="bg-muted px-1 rounded">https://</code> のみ有効。プライベートIPは拒否されます。
        </p>
      </div>

      {loadError && (
        <InlineErrorBanner error={loadError} onRetry={loadConfig} />
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">Webhook URL</label>
        <input
          value={config.url ?? ''}
          onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
          placeholder="https://hooks.slack.com/..."
          className="border rounded px-2 py-1 text-xs bg-background"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">
          シークレット <span className="text-muted-foreground font-normal">（任意）</span>
        </label>
        <input
          type="password"
          value={config.secret === '****' ? '' : (config.secret ?? '')}
          onChange={e => setConfig(c => ({ ...c, secret: e.target.value }))}
          placeholder="署名検証用の秘密鍵"
          className="border rounded px-2 py-1 text-xs bg-background"
        />
        <p className="text-[10px] text-muted-foreground">
          設定すると <code className="bg-muted px-0.5 rounded">X-Webhook-Signature</code> ヘッダーが付与されます。
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !config.url}
          className="px-3 py-1.5 text-xs border rounded hover:bg-accent disabled:opacity-40 transition-colors"
        >
          {testing ? 'テスト中...' : 'テスト送信'}
        </button>
      </div>

      {saveMsg && (
        <p className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{saveMsg.text}</p>
      )}
      {testMsg && (
        <p className={`text-xs ${testMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{testMsg.text}</p>
      )}

      <div className="border-t pt-3">
        <p className="text-[10px] text-muted-foreground font-medium mb-1">ペイロード例:</p>
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
