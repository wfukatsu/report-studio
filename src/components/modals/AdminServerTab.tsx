import { useEffect, useState } from 'react'
import { getServerConfig, putServerConfig, testServerConfig, restartServer } from '@/api/reportApi'
import type { ServerConfig } from '@/api/reportApi'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

const STORAGE_OPTIONS = ['jdbc', 'cassandra', 'cosmos', 'dynamo'] as const

export function AdminServerTab() {
  const backendConnected = useReportStore((s) => s.backendConnected)
  const [config, setConfig] = useState<ServerConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)

  async function loadConfig() {
    try {
      const cfg = await getServerConfig()
      setConfig(cfg)
    } catch {
      setError('設定の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // Watch backendConnected to detect server restart completion
  useEffect(() => {
    if (restarting && backendConnected) {
      setRestarting(false)
      setError(null)
    }
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
      setError('設定の保存に失敗しました')
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
    } catch {
      setTestResult({ success: false, message: '接続テストに失敗しました' })
    } finally {
      setTesting(false)
    }
  }

  async function execRestart() {
    setRestarting(true)
    try {
      await restartServer()
    } catch {
      // Server may already be restarting — ignore network errors here
    }
  }

  if (loading) return <div className="p-5 text-xs text-muted-foreground">設定を読み込み中...</div>

  return (
    <div className="p-4 flex flex-col gap-4 max-w-lg">
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div>
        <label className="text-xs text-muted-foreground block mb-1">ストレージタイプ</label>
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
        <label className="text-xs text-muted-foreground block mb-1">Contact Points / JDBC URL</label>
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
          <label className="text-xs text-muted-foreground block mb-1">ユーザー名</label>
          <input
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={config['scalar.db.username'] ?? ''}
            onChange={(e) => setField('scalar.db.username', e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">パスワード</label>
          <input
            type="password"
            className="border rounded px-3 py-1.5 text-sm w-full bg-background"
            value={config['scalar.db.password'] ?? ''}
            onChange={(e) => setField('scalar.db.password', e.target.value)}
            placeholder={config['scalar.db.password'] === '***' ? '（設定済み）' : ''}
          />
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">接続プール</p>
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
          {testResult.message}
        </p>
      )}
      {saved && <p className="text-xs text-green-600">設定を保存しました。有効化するには再起動が必要です。</p>}

      <div className="flex gap-2 flex-wrap pt-1">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs border rounded hover:bg-accent disabled:opacity-50"
        >
          {testing ? 'テスト中...' : '接続テスト'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
        <button
          onClick={() => setShowRestartConfirm(true)}
          disabled={restarting}
          className="px-3 py-1.5 text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100 disabled:opacity-50"
        >
          {restarting ? '再起動中...' : 'サーバーを再起動'}
        </button>
      </div>

      {restarting && (
        <p className="text-xs text-muted-foreground">
          サーバーが再起動中です。しばらくお待ちください...
        </p>
      )}

      <ConfirmDialog
        open={showRestartConfirm}
        title="サーバーを再起動"
        message="サーバーを再起動しますか？再起動中は一時的に接続が切断されます。"
        confirmLabel="再起動"
        confirmVariant="danger"
        onConfirm={() => { setShowRestartConfirm(false); void execRestart() }}
        onCancel={() => setShowRestartConfirm(false)}
      />
    </div>
  )
}
