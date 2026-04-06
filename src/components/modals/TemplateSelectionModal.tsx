import { useState, useCallback } from 'react'
import { Loader2, AlertCircle, FolderOpen, FileText } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'

import { applyTemplate, createBlankDefinition } from '@/lib/templateUtils'
import { listReports, getReport } from '@/api/reportApi'
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

  const handleSelectBuiltin = (id: string | null) => {
    setSelectedBuiltinId(id)
    if (id === null) {
      // blank
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

              {BUILTIN_TEMPLATES.map((t) => (
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

              {backendLoadState === 'error' && backendLoadError && (
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

              {backendTemplates.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {backendTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleLoadBackend(t.id)}
                      disabled={loadingId !== null}
                      className="flex items-center justify-between gap-1 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm disabled:opacity-50"
                    >
                      <p className="font-medium text-xs truncate">{t.name}</p>
                      {loadingId === t.id && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                    </button>
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
