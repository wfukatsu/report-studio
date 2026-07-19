/**
 * VersionHistoryPanel — lists saved versions of the current template and
 * provides create-snapshot and point-in-time restore actions.
 *
 * Design:
 * - Only functional when backendConnected && currentTemplateId is set.
 * - `listVersions` / `createVersion` are called here (not in a hook) because:
 *   - version list is on-demand, not reactive
 *   - operations are one-shot (button click), not lifecycle-driven
 * - Graceful empty state when the backend is not yet running (shows connect hint).
 */

import { useState, useCallback } from 'react'
import { History, Plus, RotateCcw, AlertCircle, Loader2 } from 'lucide-react'
import { useReportStore } from '@/store'
import { listVersions, createVersion, restoreVersion } from '@/api/reportApi'
import type { VersionListItem } from '@/api/reportApi'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function VersionHistoryPanel() {
  const backendConnected = useReportStore((s) => s.backendConnected)
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)

  const [versions, setVersions] = useState<VersionListItem[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)

  const handleLoadVersions = useCallback(async () => {
    if (!currentTemplateId) return
    setLoadState('loading')
    setLoadError(null)
    try {
      const items = await listVersions(currentTemplateId)
      // Sort descending by versionNumber (newest first)
      setVersions([...items].sort((a, b) => b.versionNumber - a.versionNumber))
      setLoadState('idle')
    } catch (_err) {
      setLoadState('error')
      setLoadError('バージョン一覧の取得に失敗しました')
    }
  }, [currentTemplateId])

  const handleCreateVersion = async () => {
    if (!currentTemplateId || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const newVersion = await createVersion(currentTemplateId)
      setVersions((prev) => [newVersion, ...prev])
    } catch (_err) {
      setCreateError('バージョンの作成に失敗しました')
      setTimeout(() => setCreateError(null), 5000)
    } finally {
      setCreating(false)
    }
  }

  const execRestore = async (versionId: string) => {
    if (!currentTemplateId || restoringId) return
    setRestoringId(versionId)
    setRestoreError(null)
    try {
      await restoreVersion(currentTemplateId, versionId)
      // restoreVersion calls loadFromBackend, which resets the store
    } catch (_err) {
      setRestoreError('復元に失敗しました')
      setTimeout(() => setRestoreError(null), 5000)
    } finally {
      setRestoringId(null)
    }
  }

  // Not connected to backend
  if (!backendConnected) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          バージョン履歴
        </p>
        <p className="text-xs text-muted-foreground">
          バックエンドに接続されていません。バックエンドを起動するとバージョン管理が使用できます。
        </p>
      </div>
    )
  }

  // Connected but no template loaded from backend
  if (!currentTemplateId) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          バージョン履歴
        </p>
        <p className="text-xs text-muted-foreground">
          バックエンドからテンプレートを読み込むとバージョン管理が使用できます。
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          バージョン履歴
        </p>
        <button
          onClick={handleLoadVersions}
          disabled={loadState === 'loading'}
          className="text-xs text-primary hover:underline disabled:opacity-50"
          aria-label="バージョン一覧を更新"
        >
          {loadState === 'loading' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '更新'}
        </button>
      </div>

      {/* Create snapshot button */}
      <button
        onClick={handleCreateVersion}
        disabled={creating}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border text-xs hover:bg-accent transition-colors disabled:opacity-50"
        aria-label="現在の状態をバージョンとして保存"
      >
        {creating
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Plus className="w-3.5 h-3.5" />}
        {creating ? '作成中...' : 'バージョンを作成'}
      </button>

      {/* Create error */}
      {createError && (
        <div role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{createError}</span>
        </div>
      )}

      {/* Restore error */}
      {restoreError && (
        <div role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{restoreError}</span>
        </div>
      )}

      {/* Load error */}
      {loadState === 'error' && loadError && (
        <div role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Version list */}
      {loadState === 'idle' && versions.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <History className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            バージョンがありません。「バージョンを作成」で<br />スナップショットを保存できます。
          </p>
        </div>
      )}

      {versions.length > 0 && (
        <ul className="space-y-1.5" role="list" aria-label="バージョン一覧">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-1 rounded border bg-card px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">v{v.versionNumber}</p>
                <p className="text-[10px] text-muted-foreground">{formatDate(v.createdAt)}</p>
                {v.createdBy && (
                  <p className="text-[10px] text-muted-foreground truncate">{v.createdBy}</p>
                )}
              </div>
              <button
                onClick={() => setRestoreTarget(v.id)}
                disabled={restoringId !== null}
                aria-label={`v${v.versionNumber} に復元`}
                title={`v${v.versionNumber} に復元`}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border hover:bg-accent transition-colors disabled:opacity-40"
              >
                {restoringId === v.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RotateCcw className="w-3 h-3" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        title="バージョンを復元"
        message="このバージョンに復元しますか？現在の未保存の変更は失われます。"
        confirmLabel="復元"
        confirmVariant="danger"
        onConfirm={() => { if (restoreTarget) void execRestore(restoreTarget); setRestoreTarget(null) }}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  )
}
