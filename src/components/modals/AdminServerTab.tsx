import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getServerConfig, putServerConfig, testServerConfig, restartServer } from '@/api/reportApi'
import type { ServerConfig } from '@/api/reportApi'
import { isApiError, parseApiErrorBody } from '@/api/client'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

const STORAGE_OPTIONS = ['jdbc', 'cassandra', 'cosmos', 'dynamo'] as const

/** Server `code` → serverErrors key; unknown codes fall back to the raw `message` (#412). */
const TEST_RESULT_KEY = {
  CONNECTION_TEST_FAILED: 'admin.CONNECTION_TEST_FAILED',
  CONNECTION_TEST_SUCCESS: 'admin.CONNECTION_TEST_SUCCESS',
} as const

export function AdminServerTab() {
  const { t } = useTranslation('modals')
  const { t: tErr } = useTranslation('serverErrors')
  const backendConnected = useReportStore((s) => s.backendConnected)
  const [config, setConfig] = useState<ServerConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; code?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)

  // Initial fetch — state updates happen asynchronously in the promise
  // callbacks (loading already starts true), keeping the effect body sync-free.
  useEffect(() => {
    getServerConfig()
      .then((cfg) => setConfig(cfg))
      .catch(() => setError(t('adminServerTab.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  // Watch backendConnected to detect server restart completion. The clear is
  // deferred to a task so the effect body performs no synchronous setState;
  // the cleanup cancels it if the inputs change first.
  useEffect(() => {
    if (!(restarting && backendConnected)) return
    const id = setTimeout(() => {
      setRestarting(false)
      setError(null)
    }, 0)
    return () => clearTimeout(id)
  }, [backendConnected, restarting])

  function setField(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await putServerConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError(t('adminServerTab.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testServerConfig(config)
      setTestResult(result)
    } catch (e) {
      // The server answers a failed test with HTTP 502 + { success, message, code },
      // which apiFetch surfaces as an ApiError — recover the structured body.
      const body = isApiError(e) ? parseApiErrorBody(e) : null
      setTestResult({
        success: false,
        message: body?.message ?? t('adminServerTab.testFailed'),
        code: body?.code,
      })
    } finally {
      setTesting(false)
    }
  }

  /** Prefers the code-based translation; falls back to the raw server message. */
  function testResultText(result: { message: string; code?: string }): string {
    const key = result.code ? TEST_RESULT_KEY[result.code as keyof typeof TEST_RESULT_KEY] : undefined
    return key ? tErr(key) : result.message
  }

  async function execRestart() {
    setRestarting(true)
    try {
      await restartServer()
    } catch {
      // Server may already be restarting — ignore network errors here
    }
  }

  if (loading) return <div className="p-5 text-xs text-muted-foreground">{t('adminServerTab.loading')}</div>

  return (
    <div className="p-4 flex flex-col gap-4 max-w-lg">
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div>
        <label className="text-xs text-muted-foreground block mb-1">{t('adminServerTab.storageType')}</label>
        <select
          className="border rounded px-3 py-1.5 text-sm bg-background w-full"
          value={config['scalar.db.storage'] ?? 'jdbc'}
          onChange={(e) => setField('scalar.db.storage', e.target.value)}
        >
          {STORAGE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">{t('adminServerTab.contactPoints')}</label>
        <input
          type="text"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background font-mono"
          value={config['scalar.db.contact_points'] ?? ''}
          onChange={(e) => setField('scalar.db.contact_points', e.target.value)}
          placeholder="jdbc:sqlite:data/report-studio.db"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">{t('adminServerTab.username')}</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={config['scalar.db.username'] ?? ''}
            onChange={(e) => setField('scalar.db.username', e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">{t('adminServerTab.password')}</label>
          <input
            type="password"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={config['scalar.db.password'] ?? ''}
            onChange={(e) => setField('scalar.db.password', e.target.value)}
            placeholder={config['scalar.db.password'] === '***' ? t('adminServerTab.passwordSetPlaceholder') : ''}
          />
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">{t('adminServerTab.connectionPool')}</p>
        <div className="flex gap-2">
          {(['min_idle', 'max_idle', 'max_total'] as const).map((k) => {
            const key = `scalar.db.jdbc.connection_pool.${k}`
            return (
              <div key={k}>
                <label className="text-[10px] text-muted-foreground">{k}</label>
                <input
                  type="number"
                  min={0}
                  className="border rounded px-2 py-1 text-xs w-16 bg-background"
                  value={config[key] ?? ''}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {testResult && (
        <p className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
          {testResultText(testResult)}
        </p>
      )}
      {saved && <p className="text-xs text-green-600">{t('adminServerTab.savedNote')}</p>}

      <div className="flex gap-2 flex-wrap pt-1">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs border rounded hover:bg-accent disabled:opacity-50"
        >
          {testing ? t('adminServerTab.testing') : t('adminServerTab.testConnection')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('adminServerTab.saving') : t('adminServerTab.saveConfig')}
        </button>
        <button
          onClick={() => setShowRestartConfirm(true)}
          disabled={restarting}
          className="px-3 py-1.5 text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100 disabled:opacity-50"
        >
          {restarting ? t('adminServerTab.restarting') : t('adminServerTab.restartServer')}
        </button>
      </div>

      {restarting && (
        <p className="text-xs text-muted-foreground">
          {t('adminServerTab.restartingNote')}
        </p>
      )}

      <ConfirmDialog
        open={showRestartConfirm}
        title={t('adminServerTab.restartServer')}
        message={t('adminServerTab.restartConfirmMessage')}
        confirmLabel={t('adminServerTab.restartConfirmLabel')}
        confirmVariant="danger"
        onConfirm={() => { setShowRestartConfirm(false); void execRestart() }}
        onCancel={() => setShowRestartConfirm(false)}
      />
    </div>
  )
}
