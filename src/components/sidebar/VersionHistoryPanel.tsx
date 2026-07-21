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
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('components')
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
      setLoadError(t('sidebar.versionHistoryPanel.error.loadFailed'))
    }
  }, [currentTemplateId, t])

  const handleCreateVersion = async () => {
    if (!currentTemplateId || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const newVersion = await createVersion(currentTemplateId)
      setVersions((prev) => [newVersion, ...prev])
    } catch (_err) {
      setCreateError(t('sidebar.versionHistoryPanel.error.createFailed'))
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
      setRestoreError(t('sidebar.versionHistoryPanel.error.restoreFailed'))
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
          {t('sidebar.versionHistoryPanel.title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('sidebar.versionHistoryPanel.notConnected')}
        </p>
      </div>
    )
  }

  // Connected but no template loaded from backend
  if (!currentTemplateId) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('sidebar.versionHistoryPanel.title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('sidebar.versionHistoryPanel.noTemplate')}
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('sidebar.versionHistoryPanel.title')}
        </p>
        <button
          onClick={handleLoadVersions}
          disabled={loadState === 'loading'}
          className="text-xs text-primary hover:underline disabled:opacity-50"
          aria-label={t('sidebar.versionHistoryPanel.refreshAria')}
        >
          {loadState === 'loading' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t('sidebar.versionHistoryPanel.refresh')}
        </button>
      </div>

      {/* Create snapshot button */}
      <button
        onClick={handleCreateVersion}
        disabled={creating}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border text-xs hover:bg-accent transition-colors disabled:opacity-50"
        aria-label={t('sidebar.versionHistoryPanel.createAria')}
      >
        {creating
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Plus className="w-3.5 h-3.5" />}
        {creating ? t('sidebar.versionHistoryPanel.creating') : t('sidebar.versionHistoryPanel.create')}
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
            {t('sidebar.versionHistoryPanel.empty.line1')}<br />{t('sidebar.versionHistoryPanel.empty.line2')}
          </p>
        </div>
      )}

      {versions.length > 0 && (
        <ul className="space-y-1.5" role="list" aria-label={t('sidebar.versionHistoryPanel.listAria')}>
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
                aria-label={t('sidebar.versionHistoryPanel.restoreItemAria', { n: v.versionNumber })}
                title={t('sidebar.versionHistoryPanel.restoreItemAria', { n: v.versionNumber })}
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
        title={t('sidebar.versionHistoryPanel.confirm.title')}
        message={t('sidebar.versionHistoryPanel.confirm.message')}
        confirmLabel={t('sidebar.versionHistoryPanel.confirm.confirmLabel')}
        confirmVariant="danger"
        onConfirm={() => { if (restoreTarget) void execRestore(restoreTarget); setRestoreTarget(null) }}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  )
}
