import { useEffect, useState } from 'react'
import { getServerConfig, putServerConfig, testServerConfig, restartServer } from '@/api/reportApi'
import type { ServerConfig } from '@/api/reportApi'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type TestState = 'idle' | 'testing' | 'success' | 'failure'

const STORAGE_OPTIONS = ['jdbc', 'cassandra', 'cosmos', 'dynamo'] as const

export function ServerSettings() {
  const backendConnected = useReportStore((s) => s.backendConnected)
  const [config, setConfig] = useState<ServerConfig>({})
  const [originalConfig, setOriginalConfig] = useState<ServerConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig)

  useEffect(() => {
    void loadConfig()
  }, [])

  // Detect server restart completion
  useEffect(() => {
    if (restarting && backendConnected) {
      setRestarting(false)
      setError(null)
    }
  }, [backendConnected, restarting])

  async function loadConfig() {
    try {
      const cfg = await getServerConfig()
      setConfig(cfg)
      setOriginalConfig(cfg)
    } catch {
      setError('設定の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function setField(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveMessage(null)
    try {
      await putServerConfig(config)
      setOriginalConfig(config)
      setSaveMessage('設定を保存しました。有効化するには再起動が必要です。')
      setTimeout(() => setSaveMessage(null), 5000)
    } catch {
      setError('設定の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTestState('testing')
    try {
      const result = await testServerConfig(config)
      setTestState(result.success ? 'success' : 'failure')
    } catch {
      setTestState('failure')
    } finally {
      setTimeout(() => setTestState('idle'), 3000)
    }
  }

  async function execRestart() {
    setRestarting(true)
    try {
      await restartServer()
    } catch {
      // Server may already be restarting
    }
  }

  if (loading) return <div className="p-5 text-xs text-muted-foreground">設定を読み込み中...</div>

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">サーバー設定</h2>
        {isDirty && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            未保存の変更あり
          </span>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {saveMessage && <p className="text-xs text-green-600">{saveMessage}</p>}

      <fieldset className="border rounded-md p-3 flex flex-col gap-3">
        <legend className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
          接続設定
        </legend>
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
      </fieldset>

      <fieldset className="border rounded-md p-3 flex flex-col gap-3">
        <legend className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
          接続プール
        </legend>
        <div className="flex gap-3">
          {(['min_idle', 'max_idle', 'max_total'] as const).map((k) => {
            const key = `scalar.db.jdbc.connection_pool.${k}`
            return (
              <div key={k}>
                <label className="text-[10px] text-muted-foreground block mb-1">{k}</label>
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
      </fieldset>

      <div className="flex gap-2 flex-wrap pt-1">
        {/* Connection test button with 3-state feedback */}
        <button
          onClick={handleTest}
          disabled={testState === 'testing'}
          className={cn(
            'px-3 py-1.5 text-xs border rounded flex items-center gap-1.5 transition-colors',
            testState === 'success' && 'border-green-500 text-green-700 bg-green-50',
            testState === 'failure' && 'border-destructive text-destructive bg-destructive/5',
            testState === 'idle' && 'hover:bg-accent',
          )}
        >
          {testState === 'testing' && <Loader2 className="w-3 h-3 animate-spin" />}
          {testState === 'success' && <CheckCircle2 className="w-3 h-3" />}
          {testState === 'failure' && <XCircle className="w-3 h-3" />}
          {testState === 'testing' ? 'テスト中...'
            : testState === 'success' ? '接続成功'
            : testState === 'failure' ? '接続失敗'
            : '接続テスト'}
        </button>

        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
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
        message="サーバーを再起動します。再起動中は一時的に接続が切断されます。この操作を実行しますか？"
        confirmLabel="再起動する"
        confirmVariant="danger"
        onConfirm={() => { setShowRestartConfirm(false); void execRestart() }}
        onCancel={() => setShowRestartConfirm(false)}
      />
    </div>
  )
}
