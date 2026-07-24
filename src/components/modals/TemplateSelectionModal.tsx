import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, AlertCircle, FolderOpen, FileText, Copy, Download, Upload, Search, X, Trash2, Pencil, Settings } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { createBlankDefinition } from '@/lib/templateUtils'
import { filterTemplates, collectCategories, collectTags } from '@/lib/templateFilter'
import { listReports, getReport, duplicateReport, exportTemplate, importTemplate, deleteReport, saveReport, getTemplateThumbnailUrl, listPublicReports, copyTemplate } from '@/api/reportApi'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { TemplateManagerModal } from './TemplateManagerModal'
import { useModalA11y } from '@/hooks/useModalA11y'
import { downloadBlob } from '@/api/client'
import type { TemplateListItem } from '@/api/reportApi'
import type { ReportDefinition } from '@/types'

interface TemplateSelectionModalProps {
  open: boolean
  onClose: () => void
  /**
   * Called with the chosen definition after confirmation.
   * `sourceTemplateId` is the server template id this definition should be
   * bound to for subsequent saves: the id of a loaded/copied server template,
   * or `null` for a blank/builtin start (so the next save creates a NEW
   * template instead of overwriting whatever was open before). Threading this
   * through the callback is what keeps "白紙から作成 → 保存" from clobbering the
   * previously open template (#152).
   */
  onSelect: (definition: ReportDefinition, sourceTemplateId: string | null) => void
  /** Title shown in the modal header */
  title?: string
  /** Label for the confirm button */
  confirmLabel?: string
}

export function TemplateSelectionModal({ open, ...rest }: TemplateSelectionModalProps) {
  // Mount the content only while open. All transient state (in-flight flags,
  // selection, filters) lives in the content component and dies on close, so a
  // stale loadingId can never swallow a subsequent open (#154) — the old
  // clear-flags-on-close effect is no longer needed.
  if (!open) return null
  return <TemplateSelectionModalContent {...rest} />
}

function TemplateSelectionModalContent({
  onClose,
  onSelect,
  title,
  confirmLabel,
}: Omit<TemplateSelectionModalProps, 'open'>) {
  const { t } = useTranslation('modals')
  const displayTitle = title ?? t('templateSelectionModal.defaultTitle')
  const displayConfirmLabel = confirmLabel ?? t('templateSelectionModal.defaultConfirmLabel')
  const backendConnected = useReportStore((s) => s.backendConnected)
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

  // Compute categories and tags from the server templates
  const allCategories = useMemo(
    () => collectCategories(backendTemplates),
    [backendTemplates],
  )
  const allTags = useMemo(
    () => collectTags(backendTemplates),
    [backendTemplates],
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
      setBackendLoadError(t('templateSelectionModal.errorFetchList'))
    }
  }, [t])

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

  // Auto-load the server template lists when the modal opens so users don't have
  // to hunt for a "一覧を取得" button — the templates are what most people came for
  // (#157). The content mounts per open, so this runs once per open (and again if
  // the backend reconnects while open). The fetch handlers flip their loading
  // flags synchronously (wanted for user-triggered refreshes), so the effect
  // schedules them in a task instead of calling them inline.
  useEffect(() => {
    if (!backendConnected) return
    const id = setTimeout(() => {
      void handleFetchBackend()
      void handleFetchPublic()
    }, 0)
    return () => clearTimeout(id)
  }, [backendConnected, handleFetchBackend, handleFetchPublic])

  const handleCopyTemplate = async (id: string) => {
    setCopyingId(id)
    try {
      const result = await copyTemplate(id)
      const definition = await getReport(result.id)
      // A copy is a persisted, user-owned template: bind saves to the new copy's
      // id so the next 保存 updates it rather than creating yet another (#152).
      onSelect(definition, result.id)
      onClose()
    } catch {
      // Toast too, not just the in-modal banner: on the deferred path the modal
      // may already be closing, which would hide a banner-only error (#154).
      setBackendLoadError(t('templateSelectionModal.errorCopy'))
      toast.error(t('templateSelectionModal.errorCopy'), { duration: 8000 })
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
      // Bind saves to this template's id (also lets Webhook/Sequence tabs work).
      // App.tsx applies the id atomically with loadReport, including across the
      // unsaved-changes confirm gate — do NOT set it out-of-band here.
      onSelect(definition, id)
      handleClose()
    } catch {
      setBackendLoadError(t('templateSelectionModal.errorLoad'))
      toast.error(t('templateSelectionModal.errorLoad'), { duration: 8000 })
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
      setBackendLoadError(t('templateSelectionModal.errorDuplicate'))
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
      setBackendLoadError(t('templateSelectionModal.errorExport'))
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
      setBackendLoadError(err instanceof Error ? err.message : t('templateSelectionModal.errorImport'))
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
      setBackendLoadError(t('templateSelectionModal.errorDelete'))
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
      setBackendLoadError(t('templateSelectionModal.errorRename'))
    } finally {
      setRenameSaving(false)
      setRenamingId(null)
    }
  }

  const handleSelectBlank = () => {
    setSelectedDefinition(createBlankDefinition())
  }

  const handleConfirm = () => {
    if (selectedDefinition) {
      // Blank start: no server template backs it yet, so clear the bound id
      // (null) — the first 保存 must create a NEW template rather than
      // overwrite whatever was open before (#152).
      onSelect(selectedDefinition, null)
      onClose()
    }
  }

  const handleClose = () => {
    setSelectedDefinition(null)
    setSearchQuery('')
    setSelectedCategory(null)
    setSelectedFilterTags([])
    setDeleteConfirmId(null)
    setRenamingId(null)
    setManagerOpen(false)
    onClose()
  }

  // #428: focus trap + Esc + opener focus restore (mounted only while open).
  // The nested TemplateManagerModal keeps its own Esc handling and stops
  // propagation, so it is not affected by this hook.
  const { dialogRef } = useModalA11y({ open: true, onClose: handleClose })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
    >
      <div ref={dialogRef} className="bg-background border border-border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold">{displayTitle}</h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-xs"
            aria-label={t('templateSelectionModal.close')}
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
              placeholder={t('templateSelectionModal.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                aria-label={t('templateSelectionModal.clearSearch')}
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
                {t('templateSelectionModal.all')}
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
              <span className="text-[10px] text-muted-foreground mr-0.5">{t('templateSelectionModal.tagsLabel')}</span>
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
                  aria-label={t('templateSelectionModal.clearTagFilter')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Blank template */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {t('templateSelectionModal.sectionTemplate')}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {/* Blank option */}
              <button
                onClick={handleSelectBlank}
                className={`flex flex-col rounded-lg border-2 transition-colors text-sm overflow-hidden text-left ${
                  selectedDefinition !== null
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <div
                  className="w-full flex flex-col items-center justify-center gap-1.5 bg-muted/40 border-b border-dashed"
                  style={{ aspectRatio: '210 / 297' }}
                >
                  <FileText className="w-7 h-7 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{t('templateSelectionModal.blankFromScratch')}</span>
                </div>
                <p className="px-2 py-1.5 font-medium text-xs">{t('templateSelectionModal.blank')}</p>
              </button>
            </div>
          </div>

          {/* Backend templates */}
          {backendConnected && (
            <div>
              <div className="border-t my-1" />
              <div className="flex items-center justify-between mb-3 mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('templateSelectionModal.myTemplates')}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImportClick}
                    disabled={importing}
                    title={t('templateSelectionModal.importTitle')}
                    aria-label={t('templateSelectionModal.importAria')}
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {importing
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Upload className="w-3 h-3" />
                    }
                    {t('templateSelectionModal.importLabel')}
                  </button>
                  <button
                    onClick={handleFetchBackend}
                    disabled={backendLoadState === 'loading'}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {backendLoadState === 'loading'
                      ? <Loader2 className="w-3 h-3 animate-spin inline" />
                      : t('templateSelectionModal.fetchList')}
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
                aria-label={t('templateSelectionModal.importFileSelect')}
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
                  <p className="text-xs text-muted-foreground">{t('templateSelectionModal.noSavedTemplates')}</p>
                </div>
              )}

              {filteredBackend.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {filteredBackend.map((tpl) => (
                    <div key={tpl.id} className="relative group">
                      <button
                        onClick={() => handleLoadBackend(tpl.id)}
                        disabled={loadingId !== null || duplicatingId !== null}
                        className="w-full flex flex-col rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 overflow-hidden text-left"
                        aria-label={t('templateSelectionModal.openTemplate', { name: tpl.name })}
                      >
                        {/* Thumbnail */}
                        <div className="w-full bg-muted flex items-center justify-center" style={{ aspectRatio: '210/297' }}>
                          <img
                            src={getTemplateThumbnailUrl(tpl.id)}
                            alt={t('templateSelectionModal.thumbnailAlt', { name: tpl.name })}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              const target = e.currentTarget
                              target.style.display = 'none'
                              target.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                          <FileText className="hidden w-8 h-8 text-muted-foreground" />
                          {loadingId === tpl.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                              <Loader2 className="w-5 h-5 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        {/* Name */}
                        {renamingId === tpl.id ? (
                          <input
                            className="px-2 py-1.5 font-medium text-xs w-full bg-background border-t focus:outline-none focus:ring-1 focus:ring-primary"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleCommitRename(tpl.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => handleCommitRename(tpl.id)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            disabled={renameSaving}
                          />
                        ) : (
                          <p className="px-2 py-1.5 font-medium text-xs truncate">{tpl.name}</p>
                        )}
                      </button>
                      {/* Action buttons — appear on hover */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleStartRename(tpl.id, tpl.name, e)}
                          disabled={renameSaving}
                          title={t('templateSelectionModal.rename')}
                          aria-label={t('templateSelectionModal.renameAria', { name: tpl.name })}
                          className="p-1 rounded bg-background/90 border border-border hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleExport(tpl.id, e)}
                          disabled={exportingId !== null || loadingId !== null}
                          title={t('templateSelectionModal.export')}
                          aria-label={t('templateSelectionModal.exportAria', { name: tpl.name })}
                          className="p-1 rounded bg-background/90 border border-border hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
                        >
                          {exportingId === tpl.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />
                          }
                        </button>
                        <button
                          onClick={(e) => handleDuplicate(tpl.id, e)}
                          disabled={duplicatingId !== null || loadingId !== null}
                          title={t('templateSelectionModal.duplicate')}
                          aria-label={t('templateSelectionModal.duplicateAria', { name: tpl.name })}
                          className="p-1 rounded bg-background/90 border border-border hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
                        >
                          {duplicatingId === tpl.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Copy className="w-3 h-3" />
                          }
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(tpl.id) }}
                          disabled={deletingId !== null}
                          title={t('templateSelectionModal.delete')}
                          aria-label={t('templateSelectionModal.deleteAria', { name: tpl.name })}
                          className="p-1 rounded bg-background/90 border border-destructive/30 hover:bg-destructive/10 transition-colors disabled:opacity-50 shadow-sm text-destructive"
                        >
                          {deletingId === tpl.id
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
                <h3 className="text-sm font-medium">{t('templateSelectionModal.publicTemplates')}</h3>
                <button
                  onClick={handleFetchPublic}
                  disabled={publicLoadState === 'loading'}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {publicLoadState === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                  {t('templateSelectionModal.load')}
                </button>
              </div>
              {publicTemplates.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {publicTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => handleCopyTemplate(tpl.id)}
                      disabled={copyingId !== null}
                      className="w-full flex flex-col rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 overflow-hidden text-left p-2"
                      aria-label={t('templateSelectionModal.copyPublicAria', { name: tpl.name })}
                    >
                      <p className="font-medium text-xs truncate">{tpl.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {copyingId === tpl.id ? t('templateSelectionModal.copying') : t('templateSelectionModal.clickToCopy')}
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
            {t('templateSelectionModal.manageTemplates')}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-1.5 text-xs rounded border border-border bg-background hover:bg-accent transition-colors"
            >
              {t('templateSelectionModal.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedDefinition === null}
              className="px-4 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {displayConfirmLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Template manager modal */}
      <TemplateManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title={t('templateSelectionModal.deleteConfirmTitle')}
        message={t('templateSelectionModal.deleteConfirmMessage', { name: backendTemplates.find((tpl) => tpl.id === deleteConfirmId)?.name ?? '' })}
        confirmLabel={t('templateSelectionModal.delete')}
        confirmVariant="danger"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  )
}
