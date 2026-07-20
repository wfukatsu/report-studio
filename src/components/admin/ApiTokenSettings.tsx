/**
 * ApiTokenSettings — create / list / revoke Personal Access Tokens (#195).
 *
 * The plaintext token is shown exactly once, right after creation, in a copyable
 * box. Thereafter only a preview (first characters) and metadata are visible.
 * Tokens authenticate CLI/CI via `Authorization: Bearer <token>`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2, Copy, Check, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  listApiTokens, createApiToken, revokeApiToken, type ApiTokenSummary,
} from '@/api/reportApi'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

function formatDate(epochMs: number): string {
  if (!epochMs) return '—'
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(epochMs))
  } catch {
    return String(epochMs)
  }
}

export function ApiTokenSettings() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([])
  // Starts true: the initial fetch begins on mount, so deriving the initial
  // spinner from state avoids a synchronous setState in the mount effect.
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenSummary | null>(null)

  // Event-handler refresh: shows the spinner for user-triggered refreshes.
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTokens(await listApiTokens())
    } catch {
      toast.error('トークン一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch — all state updates happen asynchronously in the promise
  // callbacks (loading already starts true), so the effect body stays sync-free.
  useEffect(() => {
    listApiTokens()
      .then((items) => setTokens(items))
      .catch(() => toast.error('トークン一覧の取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createApiToken(label.trim())
      setNewToken(created.token)
      setLabel('')
      await refresh()
    } catch {
      toast.error('トークンの作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }, [creating, label, refresh])

  const handleCopy = useCallback(async () => {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('コピーに失敗しました')
    }
  }, [newToken])

  const handleRevoke = useCallback(async (t: ApiTokenSummary) => {
    try {
      await revokeApiToken(t.id)
      await refresh()
      toast.success('トークンを失効しました')
    } catch {
      toast.error('トークンの失効に失敗しました')
    }
  }, [refresh])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">APIトークン (PAT)</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        CLI や CI からログインせずに API を利用するためのトークンです。
        <code className="mx-1 px-1 py-0.5 bg-muted rounded font-mono text-[11px]">Authorization: Bearer &lt;token&gt;</code>
        で送信します。トークンは作成時に一度だけ表示されます。
      </p>

      {/* Create */}
      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="用途ラベル（例: CI, ローカルCLI）"
          className="flex-1 text-sm px-2 py-1.5 rounded border bg-background"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
        >
          {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          発行
        </button>
      </div>

      {/* One-time plaintext reveal */}
      {newToken && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
          <p className="text-xs font-medium text-green-800">
            トークンを発行しました。この値は再表示されません。今すぐコピーして保管してください。
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] font-mono bg-white border rounded px-2 py-1 break-all">{newToken}</code>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded border hover:bg-white text-green-700"
              aria-label="コピー"
              title="コピー"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="text-[11px] text-green-700 underline">
            閉じる
          </button>
        </div>
      )}

      {/* List */}
      {loading && tokens.length === 0 ? (
        <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">発行済みのトークンはありません。</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left border-b">
              <th className="px-2 py-1.5 font-medium">ラベル</th>
              <th className="px-2 py-1.5 font-medium">プレビュー</th>
              <th className="px-2 py-1.5 font-medium">作成</th>
              <th className="px-2 py-1.5 font-medium">最終利用</th>
              <th className="px-2 py-1.5 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tokens.map((t) => (
              <tr key={t.id}>
                <td className="px-2 py-1.5">{t.label || '（無題）'}</td>
                <td className="px-2 py-1.5 font-mono text-gray-500">{t.preview}</td>
                <td className="px-2 py-1.5 text-gray-500">{formatDate(t.createdAt)}</td>
                <td className="px-2 py-1.5 text-gray-500">{t.lastUsedAt ? formatDate(t.lastUsedAt) : '未使用'}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={() => setRevokeTarget(t)}
                    className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                    aria-label="失効"
                    title="失効"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="トークンを失効"
        message={`トークン「${revokeTarget?.label || revokeTarget?.preview}」を失効しますか？このトークンを使う CLI/CI は認証できなくなります。`}
        confirmLabel="失効"
        confirmVariant="danger"
        onConfirm={() => { if (revokeTarget) void handleRevoke(revokeTarget); setRevokeTarget(null) }}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
