/**
 * TemplateManagerModal — full template management UI.
 * Lists server-saved templates with inline editing of name, category, tags.
 * Templates can be deleted and renamed.
 */

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Trash2, Pencil, FolderOpen, AlertCircle } from 'lucide-react'
import { listReports, getReport, saveReport, deleteReport, updateVisibility } from '@/api/reportApi'
import type { TemplateListItem } from '@/api/reportApi'
import type { ReportDefinition } from '@/types'
import { CategoryCombobox } from '@/components/common/CategoryCombobox'
import { TagInput } from '@/components/common/TagInput'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { collectCategories } from '@/lib/templateFilter'

// Visibility display helpers for the management list (#162).
const VISIBILITY_LABEL: Record<'private' | 'shared' | 'public', string> = {
  private: '個人', shared: '共有', public: '公開',
}
const VISIBILITY_BADGE: Record<'private' | 'shared' | 'public', string> = {
  private: 'bg-muted text-muted-foreground',
  shared: 'bg-amber-50 text-amber-600',
  public: 'bg-blue-50 text-blue-600',
}

/** Compact "最終更新" formatting; tolerates missing/invalid timestamps. */
function formatUpdatedAt(iso?: string): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  return new Date(t).toLocaleDateString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * TemplateManagerContent — the body content of the template manager, usable standalone
 * (e.g., in a tab page) or embedded inside TemplateManagerModal.
 */
export function TemplateManagerContent() {
  const [backendTemplates, setBackendTemplates] = useState<TemplateListItem[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [hasFetched, setHasFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline edit states
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Category editing
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null)

  const categoryOptions = collectCategories(backendTemplates)

  const handleFetch = useCallback(async () => {
    setLoadState('loading')
    setError(null)
    try {
      const result = await listReports()
      setBackendTemplates(result.items)
      setLoadState('idle')
      setHasFetched(true)
    } catch {
      setLoadState('error')
      setError('テンプレート一覧の取得に失敗しました')
    }
  }, [])

  // Auto-load the list on mount so the management view isn't blank until the user
  // finds the "一覧を取得" button (#162).
  useEffect(() => { void handleFetch() }, [handleFetch])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await deleteReport(id)
      await handleFetch()
    } catch {
      setError('テンプレートの削除に失敗しました')
    } finally {
      setDeletingId(null)
      setDeleteConfirmId(null)
    }
  }

  const handleRename = async (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setSavingId(id)
    setError(null)
    try {
      const def = await getReport(id)
      await saveReport(id, { ...def, metadata: { ...def.metadata, documentName: trimmed } })
      await handleFetch()
    } catch {
      setError('名前の変更に失敗しました')
    } finally {
      setSavingId(null)
      setRenamingId(null)
    }
  }

  const handleCycleVisibility = async (id: string, current: 'private' | 'shared' | 'public') => {
    const next = current === 'private' ? 'shared' : current === 'shared' ? 'public' : 'private'
    setSavingId(id)
    setError(null)
    try {
      await updateVisibility(id, next)
      await handleFetch()
    } catch {
      setError('公開範囲の変更に失敗しました')
    } finally {
      setSavingId(null)
    }
  }

  const handleUpdateMetadata = async (id: string, patch: Partial<ReportDefinition['metadata']>) => {
    setSavingId(id)
    setError(null)
    try {
      const def = await getReport(id)
      await saveReport(id, { ...def, metadata: { ...def.metadata, ...patch } })
      await handleFetch()
    } catch {
      setError('メタデータの更新に失敗しました')
    } finally {
      setSavingId(null)
      setEditingCategoryId(null)
      setEditingTagsId(null)
    }
  }

  return (
    <>
    <div className="p-5 space-y-5">
          {error && (
            <div role="alert" className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Backend templates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                保存済みテンプレート
              </p>
              <button
                onClick={handleFetch}
                disabled={loadState === 'loading'}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {loadState === 'loading' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '更新'}
              </button>
            </div>

            {loadState === 'idle' && backendTemplates.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <FolderOpen className="w-5 h-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {hasFetched
                    ? 'テンプレートがありません。'
                    : '読み込み中...'}
                </p>
              </div>
            )}

            {backendTemplates.length > 0 && (
              <div className="border rounded divide-y">
                {backendTemplates.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs group">
                    {/* Name */}
                    {renamingId === t.id ? (
                      <input
                        className="font-medium w-40 border rounded px-1.5 py-0.5 text-xs bg-background"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleRename(t.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => handleRename(t.id)}
                        autoFocus
                        disabled={savingId === t.id}
                      />
                    ) : (
                      <span
                        className="font-medium w-40 truncate cursor-pointer hover:text-primary"
                        onClick={() => { setRenamingId(t.id); setRenameValue(t.name) }}
                        title="クリックして名前を変更"
                      >
                        {t.name}
                      </span>
                    )}

                    {/* Category */}
                    {editingCategoryId === t.id ? (
                      <div className="w-28" onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setEditingCategoryId(null)
                        }
                      }}>
                        <CategoryCombobox
                          value={t.category}
                          options={categoryOptions}
                          onChange={(v) => {
                            handleUpdateMetadata(t.id, { category: v })
                            setEditingCategoryId(null)
                          }}
                        />
                      </div>
                    ) : (
                      <span
                        className="text-muted-foreground w-28 truncate cursor-pointer hover:text-primary"
                        onClick={() => setEditingCategoryId(t.id)}
                        title="クリックしてカテゴリを変更"
                      >
                        {t.category ?? '—'}
                      </span>
                    )}

                    {/* Tags */}
                    {editingTagsId === t.id ? (
                      <div className="flex-1" onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setEditingTagsId(null)
                        }
                      }}>
                        <TagInput
                          value={t.tags ?? []}
                          onChange={(tags) => handleUpdateMetadata(t.id, { tags })}
                        />
                      </div>
                    ) : (
                      <div
                        className="flex-1 flex gap-1 flex-wrap cursor-pointer min-h-[20px]"
                        onClick={() => setEditingTagsId(t.id)}
                        title="クリックしてタグを編集"
                      >
                        {(t.tags ?? []).length > 0
                          ? (t.tags ?? []).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{tag}</span>
                            ))
                          : <span className="text-muted-foreground">—</span>
                        }
                      </div>
                    )}

                    {/* Visibility (click to cycle private→shared→public) + updated time (#162) */}
                    <button
                      onClick={() => handleCycleVisibility(t.id, t.visibility ?? 'private')}
                      disabled={savingId === t.id}
                      className={`shrink-0 w-14 text-center text-[10px] px-1 py-0.5 rounded disabled:opacity-50 ${VISIBILITY_BADGE[t.visibility ?? 'private']}`}
                      title="クリックで公開範囲を変更（個人→共有→公開）"
                    >
                      {VISIBILITY_LABEL[t.visibility ?? 'private']}
                    </button>
                    <span className="shrink-0 w-24 text-[10px] text-muted-foreground text-right tabular-nums" title="最終更新">
                      {formatUpdatedAt(t.updatedAt)}
                    </span>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setRenamingId(t.id); setRenameValue(t.name) }}
                        title="名前変更"
                        className="p-1 rounded hover:bg-accent"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(t.id)}
                        disabled={deletingId !== null}
                        title="削除"
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      >
                        {deletingId === t.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
    </div>

    <ConfirmDialog
      open={deleteConfirmId !== null}
      title="テンプレートを削除"
      message={`「${backendTemplates.find((t) => t.id === deleteConfirmId)?.name ?? ''}」を削除しますか？この操作は取り消せません。`}
      confirmLabel="削除"
      confirmVariant="danger"
      onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
      onCancel={() => setDeleteConfirmId(null)}
    />
    </>
  )
}

// ---------------------------------------------------------------------------
// Modal wrapper — thin portal wrapper around TemplateManagerContent
// ---------------------------------------------------------------------------

export function TemplateManagerModal({ open, onClose }: Props) {
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="テンプレート管理"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold">テンプレート管理</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TemplateManagerContent />
        </div>
        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded border border-border bg-background hover:bg-accent transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
