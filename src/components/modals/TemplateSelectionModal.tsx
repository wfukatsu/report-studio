import { useState, useCallback, useRef, useMemo } from 'react'
import { Loader2, AlertCircle, FolderOpen, FileText, Copy, Download, Upload, Search, X, Trash2, Pencil, Settings } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'

import { loadBuiltinTemplate, createBlankDefinition } from '@/lib/templateUtils'
import { filterTemplates, collectCategories, collectTags } from '@/lib/templateFilter'
import { useBuiltinPrefs } from '@/hooks/useBuiltinPrefs'
import { listReports, getReport, duplicateReport, exportTemplate, importTemplate, deleteReport, saveReport, getTemplateThumbnailUrl, listPublicReports, copyTemplate } from '@/api/reportApi'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { TemplateManagerModal } from './TemplateManagerModal'
import { downloadBlob } from '@/api/client'
import type { TemplateListItem } from '@/api/reportApi'
import type { ReportDefinition } from '@/types'

interface TemplateSelectionModalProps {
  open: boolean
  onClose: () => void
  /** Called with the chosen definition after confirmation */
  onSelect: (definition: ReportDefinition) => void
  /** Title shown in the modal header */
  title?: string
  /** Label for the confirm button */
  confirmLabel?: string
}

export function TemplateSelectionModal({
  open,
  onClose,
  onSelect,
  title = '新規レポート作成',
  confirmLabel = '作成',
}: TemplateSelectionModalProps) {
  const backendConnected = useReportStore((s) => s.backendConnected)
  const { prefs } = useBuiltinPrefs()
  const [selectedBuiltinId, setSelectedBuiltinId] = useState<string | null>(null)
  const [selectedDefinition, setSelectedDefinition] = useState<ReportDefinition | null>(null)

  // Backend template state (own templates)
  const [backendTemplates, setBackendTemplates] = useState<TemplateListItem[]>([])
  const [backendLoadState, setBackendLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null)

  // Public templates state
  const [publicTemplates, setPublicTemplates] = useState<TemplateListItem[]>([])
  const [publicLoadState, setPublicLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  // Manager modal
  const [managerOpen, setManagerOpen] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Apply overrides and filter hidden builtins
  const visibleBuiltins = useMemo(
    () => BUILTIN_TEMPLATES
      .filter((t) => !prefs.hidden.includes(t.id))
      .map((t) => {
        const override = prefs.overrides[t.id]
        if (!override) return t
        return { ...t, category: override.category ?? t.category, tags: override.tags ?? t.tags }
      }),
    [prefs],
  )

  // Compute categories and tags from all templates
  const allCategories = useMemo(
    () => collectCategories([...visibleBuiltins, ...backendTemplates]),
    [visibleBuiltins, backendTemplates],
  )
  const allTags = useMemo(
    () => collectTags([...visibleBuiltins, ...backendTemplates]),
    [visibleBuiltins, backendTemplates],
  )

  // Filter builtin templates
  const filteredBuiltins = useMemo(
    () => filterTemplates(visibleBuiltins, { query: searchQuery, category: selectedCategory ?? undefined, tags: selectedFilterTags }),
    [visibleBuiltins, searchQuery, selectedCategory, selectedFilterTags],
  )

  // Filter backend templates
  const filteredBackend = useMemo(
    () => filterTemplates(backendTemplates, { query: searchQuery, category: selectedCategory ?? undefined, tags: selectedFilterTags }),
    [backendTemplates, searchQuery, selectedCategory, selectedFilterTags],
  )

  const handleFetchBackend = useCallback(async () => {
    setBackendLoadState('loading')
    setBackendLoadError(null)
    try {
      const result = await listReports()
      setBackendTemplates(result.items)
      setBackendLoadState('idle')
    } catch {
      setBackendLoadState('error')
      setBackendLoadError('テンプレート一覧の取得に失敗しました')
    }
  }, [])

  const handleFetchPublic = useCallback(async () => {
    setPublicLoadState('loading')
    try {
      const result = await listPublicReports()
      setPublicTemplates(result.items)
      setPublicLoadState('idle')
    } catch {
      setPublicLoadState('error')
    }
  }, [])

  const handleCopyTemplate = async (id: string) => {
    setCopyingId(id)
    try {
      const result = await copyTemplate(id)
      const definition = await getReport(result.id)
      onSelect(definition)
      onClose()
    } catch {
      setBackendLoadError('テンプレートのコピーに失敗しました')
    } finally {
      setCopyingId(null)
    }
  }

  const handleLoadBackend = async (id: string) => {
    if (loadingId) return
    setLoadingId(id)
    setBackendLoadError(null)
    try {
      const definition = await getReport(id)
      onSelect(definition)
      // Ensure currentTemplateId is set so Webhook/Sequence tabs work
      useReportStore.getState().setCurrentTemplateId(id)
      handleClose()
    } catch {
      setBackendLoadError('テンプレートの読み込みに失敗しました')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (duplicatingId) return
    setDuplicatingId(id)
    setBackendLoadError(null)
    try {
      await duplicateReport(id)
      await handleFetchBackend()
    } catch {
      setBackendLoadError('テンプレートの複製に失敗しました')
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleExport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (exportingId) return
    setExportingId(id)
    setBackendLoadError(null)
    try {
      const { blob, filename } = await exportTemplate(id)
      downloadBlob(blob, filename)
    } catch {
      setBackendLoadError('テンプレートのエクスポートに失敗しました')
    } finally {
      setExportingId(null)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-imported
    e.target.value = ''

    setImporting(true)
    setBackendLoadError(null)
    try {
      const text = await file.text()
      await importTemplate(text)
      await handleFetchBackend()
    } catch (err) {
      setBackendLoadError(err instanceof Error ? err.message : 'インポートに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setBackendLoadError(null)
    try {
      await deleteReport(id)
      await handleFetchBackend()
    } catch {
      setBackendLoadError('テンプレートの削除に失敗しました')
    } finally {
      setDeletingId(null)
      setDeleteConfirmId(null)
    }
  }

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const handleCommitRename = async (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed || renameSaving) return
    setRenameSaving(true)
    setBackendLoadError(null)
    try {
      const def = await getReport(id)
      await saveReport(id, { ...def, metadata: { ...def.metadata, documentName: trimmed } })
      await handleFetchBackend()
    } catch {
      setBackendLoadError('テンプレート名の変更に失敗しました')
    } finally {
      setRenameSaving(false)
      setRenamingId(null)
    }
  }

  const handleSelectBuiltin = (id: string | null) => {
    setSelectedBuiltinId(id)
    if (id === null) {
      setSelectedDefinition(createBlankDefinition())
    } else {
      const definition = loadBuiltinTemplate(id)
      if (definition) setSelectedDefinition(definition)
    }
  }

  const handleConfirm = () => {
    if (selectedDefinition) {
      onSelect(selectedDefinition)
      onClose()
    }
  }

  const handleClose = () => {
    setSelectedBuiltinId(null)
    setSelectedDefinition(null)
    setSearchQuery('')
    setSelectedCategory(null)
    setSelectedFilterTags([])
    setDeleteConfirmId(null)
    setRenamingId(null)
    setManagerOpen(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-xs"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-5 pt-4 pb-2 space-y-2 border-b shrink-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              className="w-full pl-7 pr-7 py-1.5 text-xs border rounded bg-background"
              placeholder="テンプレートを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                aria-label="検索をクリア"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
          {/* Category chips */}
          {allCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                  selectedCategory === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                すべて
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-border'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          {/* Tag chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-0.5">タグ:</span>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setSelectedFilterTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                    )
                  }
                  className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                    selectedFilterTags.includes(tag)
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background hover:bg-accent border-border'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {selectedFilterTags.length > 0 && (
                <button
                  onClick={() => setSelectedFilterTags([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
                  aria-label="タグフィルタをクリア"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Built-in templates */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              テンプレート
            </p>
            <div className="grid grid-cols-3 gap-3">
              {/* Blank option */}
              <button
                onClick={() => handleSelectBuiltin(null)}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors text-sm ${
                  selectedBuiltinId === null && selectedDefinition !== null
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <FileText className="w-8 h-8 text-muted-foreground" />
                <span className="text-xs font-medium">空白</span>
                <span className="text-[10px] text-muted-foreground">白紙から作成</span>
              </button>

              {filteredBuiltins.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectBuiltin(t.id)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-colors text-sm ${
                    selectedBuiltinId === t.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-accent'
                  }`}
                >
                  <p className="font-medium text-xs">{t.name}</p>
                  {t.description && (
                    <p className="text-[10px] text-muted-foreground leading-snug">{t.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-auto">
                    {t.definition.pages.length}ページ · {t.definition.pageSettings?.paperSize ?? 'A4'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Backend templates */}
          {backendConnected && (
            <div>
              <div className="border-t my-1" />
              <div className="flex items-center justify-between mb-3 mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  バックエンドテンプレート
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImportClick}
                    disabled={importing}
                    title="テンプレートをインポート (.rds2.json)"
                    aria-label="テンプレートをインポート"
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {importing
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Upload className="w-3 h-3" />
                    }
                    インポート
                  </button>
                  <button
                    onClick={handleFetchBackend}
                    disabled={backendLoadState === 'loading'}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {backendLoadState === 'loading'
                      ? <Loader2 className="w-3 h-3 animate-spin inline" />
                      : '一覧を取得'}
                  </button>
                </div>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.rds2.json"
                className="hidden"
                onChange={handleImportFile}
                aria-label="インポートファイルを選択"
              />

              {backendLoadError && (
                <div role="alert" className="flex items-center gap-1 text-xs text-destructive mb-2">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{backendLoadError}</span>
                </div>
              )}

              {backendLoadState === 'idle' && backendTemplates.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 py-4 text-center">
                  <FolderOpen className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">「一覧を取得」でテンプレートを読み込めます。</p>
                </div>
              )}

              {filteredBackend.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {filteredBackend.map((t) => (
                    <div key={t.id} className="relative group">
                      <button
                        onClick={() => handleLoadBackend(t.id)}
                        disabled={loadingId !== null || duplicatingId !== null}
                        className="w-full flex flex-col rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 overflow-hidden text-left"
                        aria-label={`テンプレート ${t.name} を開く`}
                      >
                        {/* Thumbnail */}
                        <div className="w-full bg-muted flex items-center justify-center" style={{ aspectRatio: '210/297' }}>
                          <img
                            src={getTemplateThumbnailUrl(t.id)}
                            alt={`${t.name} のサムネイル`}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              const target = e.currentTarget
                              target.style.display = 'none'
                              target.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                          <FileText className="hidden w-8 h-8 text-muted-foreground" />
                          {loadingId === t.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                              <Loader2 className="w-5 h-5 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        {/* Name */}
                        {renamingId === t.id ? (
                          <input
                            className="px-2 py-1.5 font-medium text-xs w-full bg-background border-t focus:outline-none focus:ring-1 focus:ring-primary"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitRename(t.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => handleCommitRename(t.id)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            disabled={renameSaving}
                          />
                        ) : (
                          <p className="px-2 py-1.5 font-medium text-xs truncate">{t.name}</p>
                        )}
                      </button>
                      {/* Action buttons — appear on hover */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleStartRename(t.id, t.name, e)}
                          disabled={renameSaving}
                          title="名前変更"
                          aria-label={`${t.name} の名前を変更`}
                          className="p-1 rounded bg-background/90 border border-border hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleExport(t.id, e)}
                          disabled={exportingId !== null || loadingId !== null}
                          title="エクスポート"
                          aria-label={`${t.name} をエクスポート`}
                          className="p-1 rounded bg-background/90 border border-border hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
                        >
                          {exportingId === t.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />
                          }
                        </button>
                        <button
                          onClick={(e) => handleDuplicate(t.id, e)}
                          disabled={duplicatingId !== null || loadingId !== null}
                          title="複製"
                          aria-label={`${t.name} を複製`}
                          className="p-1 rounded bg-background/90 border border-border hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
                        >
                          {duplicatingId === t.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Copy className="w-3 h-3" />
                          }
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(t.id) }}
                          disabled={deletingId !== null}
                          title="削除"
                          aria-label={`${t.name} を削除`}
                          className="p-1 rounded bg-background/90 border border-destructive/30 hover:bg-destructive/10 transition-colors disabled:opacity-50 shadow-sm text-destructive"
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
          )}

          {/* Public templates */}
          {backendConnected && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium">公開テンプレート</h3>
                <button
                  onClick={handleFetchPublic}
                  disabled={publicLoadState === 'loading'}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {publicLoadState === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                  読み込む
                </button>
              </div>
              {publicTemplates.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {publicTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleCopyTemplate(t.id)}
                      disabled={copyingId !== null}
                      className="w-full flex flex-col rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 overflow-hidden text-left p-2"
                      aria-label={`公開テンプレート ${t.name} をコピーして使用`}
                    >
                      <p className="font-medium text-xs truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {copyingId === t.id ? 'コピー中...' : 'クリックでコピー'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t shrink-0">
          <button
            onClick={() => setManagerOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-3 h-3" />
            テンプレートを管理
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-1.5 text-xs rounded border border-border bg-background hover:bg-accent transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedDefinition === null}
              className="px-4 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Template manager modal */}
      <TemplateManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="テンプレートを削除"
        message={`「${backendTemplates.find((t) => t.id === deleteConfirmId)?.name ?? ''}」を削除しますか？この操作は取り消せません。`}
        confirmLabel="削除"
        confirmVariant="danger"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  )
}
