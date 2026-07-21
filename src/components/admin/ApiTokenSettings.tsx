/**
 * ApiTokenSettings — create / list / revoke Personal Access Tokens (#195).
 *
 * The plaintext token is shown exactly once, right after creation, in a copyable
 * box. Thereafter only a preview (first characters) and metadata are visible.
 * Tokens authenticate CLI/CI via `Authorization: Bearer <token>`.
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('components')
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
      toast.error(t('admin.apiTokenSettings.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  // Initial fetch — all state updates happen asynchronously in the promise
  // callbacks (loading already starts true), so the effect body stays sync-free.
  useEffect(() => {
    listApiTokens()
      .then((items) => setTokens(items))
      .catch(() => toast.error(t('admin.apiTokenSettings.fetchFailed')))
      .finally(() => setLoading(false))
  }, [t])

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createApiToken(label.trim())
      setNewToken(created.token)
      setLabel('')
      await refresh()
    } catch {
      toast.error(t('admin.apiTokenSettings.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [creating, label, refresh, t])

  const handleCopy = useCallback(async () => {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('admin.apiTokenSettings.copyFailed'))
    }
  }, [newToken, t])

  const handleRevoke = useCallback(async (tok: ApiTokenSummary) => {
    try {
      await revokeApiToken(tok.id)
      await refresh()
      toast.success(t('admin.apiTokenSettings.revokeSuccess'))
    } catch {
      toast.error(t('admin.apiTokenSettings.revokeFailed'))
    }
  }, [refresh, t])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">{t('admin.apiTokenSettings.title')}</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t('admin.apiTokenSettings.descBefore')}
        <code className="mx-1 px-1 py-0.5 bg-muted rounded font-mono text-[11px]">Authorization: Bearer &lt;token&gt;</code>
        {t('admin.apiTokenSettings.descAfter')}
      </p>

      {/* Create */}
      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('admin.apiTokenSettings.labelPlaceholder')}
          className="flex-1 text-sm px-2 py-1.5 rounded border bg-background"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
        >
          {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('admin.apiTokenSettings.create')}
        </button>
      </div>

      {/* One-time plaintext reveal */}
      {newToken && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
          <p className="text-xs font-medium text-green-800">
            {t('admin.apiTokenSettings.createdNotice')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] font-mono bg-white border rounded px-2 py-1 break-all">{newToken}</code>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded border hover:bg-white text-green-700"
              aria-label={t('admin.apiTokenSettings.copy')}
              title={t('admin.apiTokenSettings.copy')}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="text-[11px] text-green-700 underline">
            {t('admin.apiTokenSettings.close')}
          </button>
        </div>
      )}

      {/* List */}
      {loading && tokens.length === 0 ? (
        <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">{t('admin.apiTokenSettings.empty')}</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left border-b">
              <th className="px-2 py-1.5 font-medium">{t('admin.apiTokenSettings.colLabel')}</th>
              <th className="px-2 py-1.5 font-medium">{t('admin.apiTokenSettings.colPreview')}</th>
              <th className="px-2 py-1.5 font-medium">{t('admin.apiTokenSettings.colCreated')}</th>
              <th className="px-2 py-1.5 font-medium">{t('admin.apiTokenSettings.colLastUsed')}</th>
              <th className="px-2 py-1.5 font-medium text-right">{t('admin.apiTokenSettings.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tokens.map((tok) => (
              <tr key={tok.id}>
                <td className="px-2 py-1.5">{tok.label || t('admin.apiTokenSettings.untitled')}</td>
                <td className="px-2 py-1.5 font-mono text-gray-500">{tok.preview}</td>
                <td className="px-2 py-1.5 text-gray-500">{formatDate(tok.createdAt)}</td>
                <td className="px-2 py-1.5 text-gray-500">{tok.lastUsedAt ? formatDate(tok.lastUsedAt) : t('admin.apiTokenSettings.unused')}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={() => setRevokeTarget(tok)}
                    className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                    aria-label={t('admin.apiTokenSettings.revoke')}
                    title={t('admin.apiTokenSettings.revoke')}
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
        title={t('admin.apiTokenSettings.revokeTitle')}
        message={t('admin.apiTokenSettings.revokeMessage', { name: revokeTarget?.label || revokeTarget?.preview })}
        confirmLabel={t('admin.apiTokenSettings.revoke')}
        confirmVariant="danger"
        onConfirm={() => { if (revokeTarget) void handleRevoke(revokeTarget); setRevokeTarget(null) }}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
