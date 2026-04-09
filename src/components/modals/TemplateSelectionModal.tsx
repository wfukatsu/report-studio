import { useState, useCallback, useRef, useMemo } from 'react'
import { Loader2, AlertCircle, FolderOpen, FileText, Copy, Download, Upload, Search, X } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'

import { applyTemplate, createBlankDefinition } from '@/lib/templateUtils'
import { filterTemplates, collectCategories, collectTags } from '@/lib/templateFilter'
import { listReports, getReport, duplicateReport, exportTemplate, importTemplate, getTemplateThumbnailUrl } from '@/api/reportApi'
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
  const [selectedBuiltinId, setSelectedBuiltinId] = useState<string | null>(null)
  const [selectedDefinition, setSelectedDefinition] = useState<ReportDefinition | null>(null)

  // Backend template state
  const [backendTemplates, setBackendTemplates] = useState<TemplateListItem[]>([])
  const [backendLoadState, setBackendLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Compute categories and tags from all templates
  const allCategories = useMemo(
    () => collectCategories([...BUILTIN_TEMPLATES, ...backendTemplates]),
    [backendTemplates],
  )
  const allTags = useMemo(
    () => collectTags([...BUILTIN_TEMPLATES, ...backendTemplates]),
    [backendTemplates],
  )

  // Filter builtin templates
  const filteredBuiltins = useMemo(
    () => filterTemplates(BUILTIN_TEMPLATES, { query: searchQuery, category: selectedCategory ?? undefined, tags: selectedFilterTags }),
    [searchQuery, selectedCategory, selectedFilterTags],
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

  const handleLoadBackend = async (id: string) => {
    if (loadingId) return
    setLoadingId(id)
    setBackendLoadError(null)
    try {
      const definition = await getReport(id)
      onSelect(definition)
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

  const handleSelectBuiltin = (id: string | null) => {
    setSelectedBuiltinId(id)
    if (id === null) {
      setSelectedDefinition(createBlankDefinition())
    } else {
      const template = BUILTIN_TEMPLATES.find((t) => t.id === id)
      if (template) setSelectedDefinition(applyTemplate(template))
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
                    {t.pages.length}ページ · {t.settings.paperSize}
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
                        <p className="px-2 py-1.5 font-medium text-xs truncate">{t.name}</p>
                      </button>
                      {/* Action buttons — appear on hover */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t shrink-0">
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
  )
}
