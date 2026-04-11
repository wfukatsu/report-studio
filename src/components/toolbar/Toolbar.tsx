import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Undo2, Redo2, Eye, EyeOff, FileImage, FileText, AlertCircle,
  ZoomIn, ZoomOut, AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  BringToFront, SendToBack, Copy, Clipboard, Scissors,
  Grid3X3, Magnet, Crosshair, ArrowUpToLine, ArrowDownToLine, ScanLine,
  AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter,
  Layers, ChevronDown, PanelTop, FolderOpen, Save, FilePlus, Settings2,
  ShieldCheck, ShieldAlert, Database, Shuffle, RefreshCw,
} from 'lucide-react'
import { evaluateValidate, generateTemplatePdf, generateStatelessPdf, createReport, saveReport } from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import type { ReportDefinitionInput } from '@/lib/schemas/reportDefinition'
import type { Section, OutputVariant } from '@/types'
import { useReportStore, selectActivePageId, selectActivePage } from '@/store/reportStore'
import { DataBindingModal } from '@/components/modals/DataBindingModal'
import { VariantsModal } from '@/components/modals/VariantsModal'
import { ExportVariantDialog } from '@/components/modals/ExportVariantDialog'
import { SaveTemplateDialog } from '@/components/modals/SaveTemplateDialog'
import { TemplateManagerModal } from '@/components/modals/TemplateManagerModal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { loadBuiltinTemplate } from '@/lib/templateUtils'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import { exportReportToPdf, exportPageToPng } from '@/lib/exportUtils'
import { runValidation } from '@/lib/validationRunner'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { clampZoom, computeFitZoom, FitWidthIcon, FitPageIcon } from '@/components/common/zoomUtils'
import { Tooltip } from '@/components/common/Tooltip'

interface Props {
  canvasRefs: React.RefObject<HTMLDivElement | null>[]
  /** Editor container ref — used to compute fit-width / fit-page zoom */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Callback to open the template selection modal (managed by App) */
  onRequestTemplateModal?: () => void
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

function useDropdownDismiss(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { onClose(); return }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [isOpen, onClose, ref])
}

export function Toolbar({ canvasRefs, containerRef, onRequestTemplateModal }: Props) {
  const reportName = useReportStore((s) => s.definition.metadata.documentName)
  const setReportName = useReportStore((s) => s.setReportName)
  const undo = useReportStore((s) => s.undo)
  const redo = useReportStore((s) => s.redo)
  const historyIndex = useReportStore((s) => s.historyIndex)
  const historyLength = useReportStore((s) => s.history.length)
  const previewMode = useReportStore((s) => s.previewMode)
  const setPreviewMode = useReportStore((s) => s.setPreviewMode)
  const editorZoom = useReportStore((s) => s.editorZoom)
  const previewZoom = useReportStore((s) => s.previewZoom)
  const setZoom = useReportStore((s) => s.setZoom)
  const setEditorZoom = useReportStore((s) => s.setEditorZoom)
  const activePage = useReportStore(selectActivePage)
  // When both panels have the same zoom, show it; otherwise indicate mismatch
  const zoomsMatch = editorZoom === previewZoom
  const [inputZoom, setInputZoom] = useState<string | null>(null)
  const showGrid = useReportStore((s) => s.showGrid)
  const toggleGrid = useReportStore((s) => s.toggleGrid)
  const showTrimMarks = useReportStore((s) => s.showTrimMarks)
  const showMarginGuide = useReportStore((s) => s.showMarginGuide)
  const toggleTrimMarks = useReportStore((s) => s.toggleTrimMarks)
  const toggleMarginGuide = useReportStore((s) => s.toggleMarginGuide)
  const snapToGrid = useReportStore((s) => s.snapToGrid)
  const toggleSnapToGrid = useReportStore((s) => s.toggleSnapToGrid)
  const headerEditMode = useReportStore((s) => s.headerEditMode)
  const toggleHeaderEditMode = useReportStore((s) => s.toggleHeaderEditMode)
  const setHeaderEditMode = useReportStore((s) => s.setHeaderEditMode)
  const livePreviewEnabled = useReportStore((s) => s.livePreviewEnabled)
  const toggleLivePreview = useReportStore((s) => s.toggleLivePreview)

  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const activePageId = useReportStore(selectActivePageId)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))
  const alignElements = useReportStore((s) => s.alignElements)
  const setZOrder = useReportStore((s) => s.setZOrder)
  const copyElements = useReportStore((s) => s.copyElements)
  const cutElements = useReportStore((s) => s.cutElements)
  const pasteElements = useReportStore((s) => s.pasteElements)
  const clipboard = useReportStore((s) => s.clipboard)

  const masterHeader = useReportStore((s) => s.definition.masterHeader)
  const masterFooter = useReportStore((s) => s.definition.masterFooter)
  const setMasterHeader = useReportStore((s) => s.setMasterHeader)
  const setMasterFooter = useReportStore((s) => s.setMasterFooter)

  const importReportJSON = useReportStore((s) => s.importReportJSON)
  const loadReport = useReportStore((s) => s.loadReport)
  const setCurrentTemplateId = useReportStore((s) => s.setCurrentTemplateId)
  const sourceTemplateId = useReportStore((s) => s.definition.metadata.sourceTemplateId)
  const sourceTemplate = sourceTemplateId
    ? BUILTIN_TEMPLATES.find((t) => t.id === sourceTemplateId) ?? null
    : null

  const [exportError, setExportError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [preflightErrors, setPreflightErrors] = useState<string[]>([])
  const [isValidating, setIsValidating] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const violationCount = useReportStore((s) => s.computedViolations.length)
  // Subscribe for disabled prop rendering (handleValidate reads from getState() for async correctness)
  const hasTemplateId = useReportStore((s) => s.currentTemplateId !== null)
  const backendConnected = useReportStore((s) => s.backendConnected)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [isSavingNew, setIsSavingNew] = useState(false)
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)
  const [showZOrderMenu, setShowZOrderMenu] = useState(false)
  const [showDataModal, setShowDataModal] = useState(false)
  const [showVariantsModal, setShowVariantsModal] = useState(false)
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [showVariantDialog, setShowVariantDialog] = useState(false)
  const [showUpdateFromBuiltinConfirm, setShowUpdateFromBuiltinConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveMenuRef = useRef<HTMLDivElement>(null)
  const zoomMenuRef = useRef<HTMLDivElement>(null)
  const alignMenuRef = useRef<HTMLDivElement>(null)
  const zOrderMenuRef = useRef<HTMLDivElement>(null)

  const hasSelection = selectedIds.length > 0
  const hasMultiSelection = selectedIds.length >= 2
  const singleId = selectedIds[0]

  const closeSaveMenu = useCallback(() => setShowSaveMenu(false), [])
  const closeZoomMenu = useCallback(() => setShowZoomMenu(false), [])
  const closeAlignMenu = useCallback(() => setShowAlignMenu(false), [])
  const closeZOrderMenu = useCallback(() => setShowZOrderMenu(false), [])

  useDropdownDismiss(saveMenuRef, showSaveMenu, closeSaveMenu)
  useDropdownDismiss(zoomMenuRef, showZoomMenu, closeZoomMenu)
  useDropdownDismiss(alignMenuRef, showAlignMenu, closeAlignMenu)
  useDropdownDismiss(zOrderMenuRef, showZOrderMenu, closeZOrderMenu)

  const runPreflight = async (): Promise<boolean> => {
    const { definition, testData } = useReportStore.getState()
    if (definition.validationRules.length === 0) return true
    const result = await runValidation(definition.validationRules, testData)
    if (result.hasErrors) {
      setPreflightErrors(result.violations.map((v) => v.message))
      return false
    }
    if (result.hasWarnings) {
      const messages = result.violations.map((v) => `⚠️ ${v.message}`).join('\n')
      return confirm(`バリデーション警告:\n${messages}\n\nエクスポートを続けますか？`)
    }
    return true
  }

  const handleExportPdf = async () => {
    if (isExporting) return
    setPreflightErrors([])
    const ok = await runPreflight()
    if (!ok) return
    // If variants exist, show selection dialog first
    const { definition } = useReportStore.getState()
    const variants = definition.outputVariants as OutputVariant[]
    if (variants.length > 0) {
      setShowVariantDialog(true)
      return
    }
    await doExportPdf(null)
  }

  const doExportPdf = async (variant: OutputVariant | null) => {
    setIsExporting(true)
    setExportError(null)
    const { definition, testData } = useReportStore.getState()
    const filename = variant ? `${reportName}_${variant.name}.pdf` : `${reportName}.pdf`

    // Try server-side PDF first (higher quality, vector text)
    try {
      const defJson = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>
      const dataJson = (testData ?? {}) as Record<string, unknown>
      const blob = await generateStatelessPdf(defJson, dataJson)
      downloadBlob(blob, filename)
      return
    } catch {
      // Server-side failed — fall back to client-side html2canvas
      console.warn('Server-side PDF failed, falling back to client-side rendering')
    }

    // Client-side fallback (degraded quality)
    const hiddenNodes: HTMLElement[] = []
    if (variant && variant.hiddenElementIds.length > 0) {
      for (const id of variant.hiddenElementIds) {
        const node = document.querySelector<HTMLElement>(`[data-element-id="${id}"]`)
        if (node) { node.style.visibility = 'hidden'; hiddenNodes.push(node) }
      }
    }
    try {
      const els = canvasRefs.map((r) => r.current).filter((el): el is HTMLDivElement => el !== null)
      await exportReportToPdf(els, filename)
      setExportError('ローカル生成（品質低下）でエクスポートしました')
      setTimeout(() => setExportError(null), 5000)
    } catch (_err) {
      const msg = 'エクスポートに失敗しました。もう一度お試しください。'
      setExportError(msg)
      setTimeout(() => setExportError((prev) => prev === msg ? null : prev), 5000)
    } finally {
      for (const node of hiddenNodes) { node.style.visibility = '' }
      setIsExporting(false)
    }
  }

  const handleBackendPdf = async () => {
    if (isExporting) return
    const { currentTemplateId, testData, definition } = useReportStore.getState()
    if (!currentTemplateId) return
    setIsExporting(true)
    setExportError(null)
    try {
      const tdRecord = testData as Record<string, unknown>
      const blob = await generateTemplatePdf(currentTemplateId, tdRecord)
      downloadBlob(blob, `${definition.metadata.documentName}.pdf`)
    } catch (_err) {
      const msg = 'バックエンドPDF生成に失敗しました'
      setExportError(msg)
      setTimeout(() => setExportError((prev) => prev === msg ? null : prev), 5000)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPng = async () => {
    if (isExporting) return
    setPreflightErrors([])
    const ok = await runPreflight()
    if (!ok) return
    setIsExporting(true)
    setExportError(null)
    try {
      const el = canvasRefs[0]?.current
      if (el) {
        const pageIdx = activePage ? pages.findIndex((p) => p.id === activePage.id) + 1 : 1
        await exportPageToPng(el, `${reportName}.png`, pageIdx, pages.length)
      }
    } catch (_err) {
      const msg = 'エクスポートに失敗しました。もう一度お試しください。'
      setExportError(msg)
      setTimeout(() => setExportError((prev) => prev === msg ? null : prev), 5000)
    } finally {
      setIsExporting(false)
    }
  }

  const handleValidate = async () => {
    if (isValidating) return
    const { definition, testData, currentTemplateId } = useReportStore.getState()
    if (!currentTemplateId) return

    useReportStore.getState().setComputedViolations([])
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsValidating(true)
    setValidateError(null)
    try {
      const result = await evaluateValidate(currentTemplateId, definition as unknown as ReportDefinitionInput, testData, controller.signal)
      if (controller.signal.aborted) return
      useReportStore.getState().setComputedViolations(result.violations)
    } catch (_err) {
      if (controller.signal.aborted) return
      const msg = 'バリデーションに失敗しました'
      setValidateError(msg)
      setTimeout(() => setValidateError((prev) => prev === msg ? null : prev), 5000)
    } finally {
      if (!controller.signal.aborted) setIsValidating(false)
    }
  }

  const handleAlign = (alignment: Parameters<typeof alignElements>[2]) => {
    if (!activePageId || selectedIds.length < 2) return
    alignElements(activePageId, selectedIds, alignment)
    setShowAlignMenu(false)
  }

  const handleZOrder = (order: Parameters<typeof setZOrder>[2]) => {
    if (!activePageId || !singleId) return
    setZOrder(activePageId, singleId, order)
    setShowZOrderMenu(false)
  }

  const hasUnsavedChanges = historyIndex > 0

  // Keyboard navigation for dropdown menus (#190) — ArrowDown/Up cycle through menuitem elements
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const items = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    )
    if (items.length === 0) return
    const current = document.activeElement as HTMLElement
    const idx = items.indexOf(current)
    let next: HTMLElement | undefined
    if (e.key === 'ArrowDown') next = items[(idx + 1) % items.length]
    else if (e.key === 'ArrowUp') next = items[(idx - 1 + items.length) % items.length]
    else if (e.key === 'Home') next = items[0]
    else if (e.key === 'End') next = items[items.length - 1]
    next?.focus()
  }, [])

  const handleNew = () => {
    onRequestTemplateModal?.()
  }

  const handleUpdateFromBuiltin = () => {
    if (!sourceTemplateId) return
    const definition = loadBuiltinTemplate(sourceTemplateId)
    if (!definition) {
      // Use a dedicated error state — exportError is cleared by export flows
      setRefreshError('ビルトインテンプレートが見つかりませんでした')
      setShowUpdateFromBuiltinConfirm(false)
      return
    }
    setRefreshError(null)
    loadReport(definition)
    // Reset currentTemplateId so the next Save creates a new template rather than
    // silently overwriting the user's previously-saved server record with the
    // freshly-generated built-in definition.
    setCurrentTemplateId(null)
    setShowUpdateFromBuiltinConfirm(false)
  }

  const handleOpen = () => {
    if (hasUnsavedChanges && !confirm('未保存の変更があります。破棄してファイルを開きますか？')) return
    fileInputRef.current?.click()
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setExportError('ファイルサイズが大きすぎます（10MB以下にしてください）')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result
        if (typeof text !== 'string') return
        const result = importReportJSON(text)
        if (!result.ok) {
          setExportError(result.error ?? '読み込みに失敗しました')
        }
      } catch (err) {
        setExportError(err instanceof Error ? err.message : '読み込みに失敗しました')
      }
    }
    reader.readAsText(file)
    e.target.value = '' // allow re-selecting same file
  }

  const createMasterSection = (role: 'header' | 'footer'): Section => ({
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    sectionType: role === 'header' ? 'header' : 'footer',
    height: role === 'header' ? 20 : 15,
    elements: [],
  })

  const handleToggleMasterHeader = () => {
    if (masterHeader) {
      if (!confirm('ヘッダーとその内容を削除しますか？')) return
      setMasterHeader(null)
      if (!masterFooter) setHeaderEditMode(false)
    } else {
      setMasterHeader(createMasterSection('header'))
      if (!headerEditMode) toggleHeaderEditMode()
    }
  }

  const handleToggleMasterFooter = () => {
    if (masterFooter) {
      if (!confirm('フッターとその内容を削除しますか？')) return
      setMasterFooter(null)
      if (!masterHeader) setHeaderEditMode(false)
    } else {
      setMasterFooter(createMasterSection('footer'))
      if (!headerEditMode) toggleHeaderEditMode()
      // フッター作成時にキャンバスを最下部にスクロール
      requestAnimationFrame(() => {
        containerRef?.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
  }

  const handleDownloadJson = () => {
    try {
      const definition = useReportStore.getState().definition
      const json = JSON.stringify(definition, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportName}.rds.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'ダウンロードに失敗しました')
    }
    setShowSaveMenu(false)
  }

  const handleSave = async () => {
    const { currentTemplateId, definition, setSaveState } = useReportStore.getState()

    if (!backendConnected) {
      handleDownloadJson()
      return
    }

    if (currentTemplateId) {
      // Existing template → overwrite save
      try {
        setSaveState('saving')
        await saveReport(currentTemplateId, definition)
        setSaveState('saved')
      } catch (err) {
        setSaveState('error')
        setExportError(err instanceof Error ? err.message : '保存に失敗しました')
      }
    } else {
      // New template → show name dialog
      setShowSaveDialog(true)
    }
  }

  const handleSaveNew = async (name: string) => {
    const { definition, setCurrentTemplateId, setSaveState } = useReportStore.getState()
    setIsSavingNew(true)
    try {
      setSaveState('saving')
      const created = await createReport(name)
      await saveReport(created.id, definition)
      setCurrentTemplateId(created.id)
      setShowSaveDialog(false)
      setSaveState('saved')
    } catch (err) {
      setSaveState('error')
      setExportError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setIsSavingNew(false)
    }
  }

  return (
    <>
    <header className="flex flex-col border-b bg-background shrink-0">
      {/* Main toolbar row */}
      <div className="flex items-center gap-1 h-11 px-3">
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <input
          type="text"
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          aria-label="レポート名"
          className="text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors w-44"
        />
        {hasUnsavedChanges && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
            title="未保存の変更があります"
            role="status"
            aria-label="未保存の変更があります"
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.rds.json"
          onChange={handleFileChange}
          className="hidden"
        />

        <Divider />

        {/* Undo / Redo */}
        <ToolbarButton onClick={undo} disabled={historyIndex < 1} title="元に戻す (⌘Z)">
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={redo} disabled={historyIndex >= historyLength - 1} title="やり直す (⌘⇧Z)">
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* New / Open / Save */}
        <ToolbarButton onClick={handleNew} title="新規作成">
          <FilePlus className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleOpen} title="開く">
          <FolderOpen className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowManagerModal(true)} title="テンプレート管理">
          <Settings2 className="w-4 h-4" />
        </ToolbarButton>
        {sourceTemplate && (
          <div className="relative">
            <ToolbarButton
              onClick={() => { setRefreshError(null); setShowUpdateFromBuiltinConfirm(true) }}
              title={`ビルトインテンプレート「${sourceTemplate.name}」から最新定義で更新`}
            >
              <RefreshCw className="w-4 h-4" />
            </ToolbarButton>
            {refreshError && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-destructive/10 border border-destructive/40 text-destructive text-[10px] rounded px-2 py-1 whitespace-nowrap" role="alert" aria-live="assertive" aria-atomic="true">
                {refreshError}
              </div>
            )}
          </div>
        )}
        <div className="relative flex items-center" ref={saveMenuRef}>
          <ToolbarButton onClick={handleSave} title="保存" active={hasUnsavedChanges}>
            <Save className="w-4 h-4" />
          </ToolbarButton>
          <button
            onClick={() => setShowSaveMenu((v) => !v)}
            className="h-7 px-0.5 rounded hover:bg-accent -ml-1"
            aria-expanded={showSaveMenu}
            aria-haspopup="menu"
            aria-label="保存メニュー"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          {showSaveMenu && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[210px] py-1">
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => { void handleSave(); setShowSaveMenu(false) }}
              >
                サーバーに保存
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={handleDownloadJson}
              >
                JSON ファイルとしてダウンロード
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Data binding */}
        <ToolbarButton onClick={() => setShowDataModal(true)} title="データ設定">
          <Database className="w-4 h-4" />
        </ToolbarButton>

        {/* Output variants */}
        <ToolbarButton onClick={() => setShowVariantsModal(true)} title="出力バリアント設定">
          <Shuffle className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Copy / Cut / Paste */}
        <ToolbarButton
          onClick={() => activePageId && copyElements(activePageId, selectedIds)}
          disabled={!hasSelection}
          title="コピー (⌘C)"
        >
          <Copy className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => activePageId && cutElements(activePageId, selectedIds)}
          disabled={!hasSelection}
          title="切り取り (⌘X)"
        >
          <Scissors className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            if (activePageId) {
              pasteElements(activePageId)
              requestAnimationFrame(() => {
                const ids = useReportStore.getState().selection.selectedElementIds
                if (ids.length > 0) {
                  const el = document.querySelector(`[data-element-id="${ids[0]}"]`)
                  el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
                }
              })
            }
          }}
          disabled={!clipboard || clipboard.length === 0}
          title="貼り付け (⌘V)"
        >
          <Clipboard className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Alignment dropdown */}
        <div className="relative" ref={alignMenuRef}>
          <ToolbarButton
            onClick={() => setShowAlignMenu((v) => !v)}
            disabled={selectedIds.length < 2}
            title={selectedIds.length < 2 ? '整列・配置（2つ以上の要素を選択）' : '整列・配置'}
            active={showAlignMenu}
            ariaExpanded={showAlignMenu}
            ariaHasPopup="menu"
          >
            <AlignCenter className="w-4 h-4" />
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </ToolbarButton>
          {showAlignMenu && (
            <div role="menu" className="absolute top-9 left-0 bg-popover border rounded shadow-lg z-50 py-1 min-w-[160px]" onKeyDown={handleMenuKeyDown}>
              <MenuButton onClick={() => handleAlign('left')} disabled={!hasMultiSelection} icon={<AlignLeft className="w-4 h-4" />} label="左揃え" />
              <MenuButton onClick={() => handleAlign('centerH')} disabled={!hasMultiSelection} icon={<AlignCenter className="w-4 h-4" />} label="水平中央揃え" />
              <MenuButton onClick={() => handleAlign('right')} disabled={!hasMultiSelection} icon={<AlignRight className="w-4 h-4" />} label="右揃え" />
              <div className="border-t my-1" />
              <MenuButton onClick={() => handleAlign('top')} disabled={!hasMultiSelection} icon={<AlignStartVertical className="w-4 h-4" />} label="上揃え" />
              <MenuButton onClick={() => handleAlign('centerV')} disabled={!hasMultiSelection} icon={<AlignCenterVertical className="w-4 h-4" />} label="垂直中央揃え" />
              <MenuButton onClick={() => handleAlign('bottom')} disabled={!hasMultiSelection} icon={<AlignEndVertical className="w-4 h-4" />} label="下揃え" />
              <div className="border-t my-1" />
              <MenuButton onClick={() => handleAlign('distributeH')} disabled={!hasMultiSelection} icon={<AlignHorizontalJustifyCenter className="w-4 h-4" />} label="水平均等配置" />
              <MenuButton onClick={() => handleAlign('distributeV')} disabled={!hasMultiSelection} icon={<AlignVerticalJustifyCenter className="w-4 h-4" />} label="垂直均等配置" />
            </div>
          )}
        </div>

        {/* Z-order dropdown */}
        <div className="relative" ref={zOrderMenuRef}>
          <ToolbarButton
            onClick={() => setShowZOrderMenu((v) => !v)}
            title="順序"
            active={showZOrderMenu}
            ariaExpanded={showZOrderMenu}
            ariaHasPopup="menu"
          >
            <Layers className="w-4 h-4" />
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </ToolbarButton>
          {showZOrderMenu && (
            <div role="menu" className="absolute top-9 left-0 bg-popover border rounded shadow-lg z-50 py-1 min-w-[140px]" onKeyDown={handleMenuKeyDown}>
              <MenuButton onClick={() => handleZOrder('front')} disabled={!hasSelection} icon={<BringToFront className="w-4 h-4" />} label="最前面へ" />
              <MenuButton onClick={() => handleZOrder('forward')} disabled={!hasSelection} icon={<ArrowUpToLine className="w-4 h-4" />} label="前面へ" />
              <MenuButton onClick={() => handleZOrder('backward')} disabled={!hasSelection} icon={<ArrowDownToLine className="w-4 h-4" />} label="背面へ" />
              <MenuButton onClick={() => handleZOrder('back')} disabled={!hasSelection} icon={<SendToBack className="w-4 h-4" />} label="最背面へ" />
            </div>
          )}
        </div>

        <Divider />

        {/* Grid & snap */}
        <ToolbarButton onClick={toggleGrid} active={showGrid} title="グリッド表示切替">
          <Grid3X3 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={toggleSnapToGrid} active={snapToGrid} title="グリッドにスナップ">
          <Magnet className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={toggleTrimMarks} active={showTrimMarks} title="トンボ表示切替">
          <Crosshair className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={toggleMarginGuide} active={showMarginGuide} title="余白ガイド表示切替">
          <ScanLine className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={toggleHeaderEditMode}
          active={headerEditMode}
          disabled={!masterHeader && !masterFooter}
          title="ヘッダー/フッター編集モード (セクション高さ変更)"
        >
          <PanelTop className="w-4 h-4" />
          <span className="text-xs ml-1">H/F編集</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={handleToggleMasterHeader}
          active={!!masterHeader}
          title={masterHeader ? 'マスターヘッダーを削除' : 'マスターヘッダーを作成'}
        >
          <ArrowUpToLine className="w-4 h-4" />
          <span className="text-xs ml-1">ヘッダー</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={handleToggleMasterFooter}
          active={!!masterFooter}
          title={masterFooter ? 'マスターフッターを削除' : 'マスターフッターを作成'}
        >
          <ArrowDownToLine className="w-4 h-4" />
          <span className="text-xs ml-1">フッター</span>
        </ToolbarButton>

        <div className="flex-1" />

        <div role="alert" aria-live="assertive" aria-atomic="true">
          {preflightErrors.length > 0 && (
            <div className="flex items-start gap-1 text-xs text-destructive max-w-xs">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-0.5">
                {preflightErrors.map((msg, i) => <div key={i}>⛔ {msg}</div>)}
              </div>
              <button
                className="ml-1 px-1 rounded hover:bg-accent"
                onClick={() => setPreflightErrors([])}
                aria-label="バリデーションエラーを閉じる"
              >
                &times;
              </button>
            </div>
          )}
          {!preflightErrors.length && (exportError || validateError) && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="w-3 h-3" />
              <span>{exportError ?? validateError}</span>
              <button
                className="ml-1 px-1 rounded hover:bg-accent"
                onClick={() => { setExportError(null); setValidateError(null) }}
                aria-label="エラーを閉じる"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* Zoom — editor zoom only; preview zoom shown separately when they diverge */}
        <ToolbarButton onClick={() => setEditorZoom(clampZoom(editorZoom - 0.1))} disabled={editorZoom <= 0.1} title="ズームアウト (⌘-)">
          <ZoomOut className="w-4 h-4" />
        </ToolbarButton>
        <div className="relative flex flex-col items-center" ref={zoomMenuRef}>
          <div
            className="flex items-center border rounded hover:bg-accent/50 transition-colors"
            style={!zoomsMatch ? { borderColor: 'rgb(217 119 6)' } : undefined}
            title={zoomsMatch ? undefined : `エディタ ${Math.round(editorZoom * 100)}% / プレビュー ${Math.round(previewZoom * 100)}%`}
          >
            <input
              type="text"
              value={inputZoom ?? `${Math.round(editorZoom * 100)}%`}
              onChange={(e) => setInputZoom(e.target.value)}
              onFocus={(e) => {
                setInputZoom(String(Math.round(editorZoom * 100)))
                e.target.select()
                setShowZoomMenu(false)
              }}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value.replace('%', ''))
                if (!isNaN(parsed) && parsed > 0) setEditorZoom(clampZoom(parsed / 100))
                setInputZoom(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parsed = parseFloat((e.target as HTMLInputElement).value.replace('%', ''))
                  if (!isNaN(parsed) && parsed > 0) setEditorZoom(clampZoom(parsed / 100));
                  (e.target as HTMLInputElement).blur()
                }
                if (e.key === 'Escape') { setInputZoom(null); (e.target as HTMLInputElement).blur() }
                e.stopPropagation()
              }}
              aria-label="拡大率"
              className={cn(
                'w-12 bg-transparent text-xs text-center outline-none px-1 py-1 cursor-text',
                !zoomsMatch && inputZoom === null && 'text-amber-600 font-medium',
              )}
            />
            <button
              tabIndex={-1}
              onClick={() => setShowZoomMenu((v) => !v)}
              aria-expanded={showZoomMenu}
              aria-haspopup="listbox"
              className="px-0.5 py-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          {!zoomsMatch && livePreviewEnabled && inputZoom === null && (
            <span className="text-[9px] text-amber-600 leading-none mt-0.5 whitespace-nowrap">
              P: {Math.round(previewZoom * 100)}%
            </span>
          )}
          {showZoomMenu && (
            <div role="menu" aria-label="ズームレベル" className="absolute right-0 top-9 bg-popover border rounded shadow-lg z-50 py-1 min-w-[120px]" onKeyDown={handleMenuKeyDown}>
              {ZOOM_PRESETS.map((z) => (
                <button
                  key={z}
                  role="menuitem"
                  aria-pressed={editorZoom === z}
                  className={cn(
                    'w-full text-left px-3 py-1 text-xs hover:bg-accent',
                    editorZoom === z && 'bg-accent font-medium',
                  )}
                  onClick={() => { setEditorZoom(z); setShowZoomMenu(false) }}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
              {containerRef && activePage && (
                <>
                  <div className="border-t my-1" />
                  <button
                    role="menuitem"
                    aria-label="横幅フィット"
                    title="横幅フィット"
                    className="w-full flex justify-center px-3 py-1.5 hover:bg-accent"
                    onClick={() => {
                      setEditorZoom(computeFitZoom(containerRef, activePage).fitWidth)
                      setShowZoomMenu(false)
                    }}
                  >
                    <FitWidthIcon />
                  </button>
                  <button
                    role="menuitem"
                    aria-label="ページ全体フィット"
                    title="ページ全体フィット"
                    className="w-full flex justify-center px-3 py-1.5 hover:bg-accent"
                    onClick={() => {
                      setEditorZoom(computeFitZoom(containerRef, activePage).fitPage)
                      setShowZoomMenu(false)
                    }}
                  >
                    <FitPageIcon />
                  </button>
                </>
              )}
              {!zoomsMatch && (
                <>
                  <div className="border-t my-1" />
                  <button
                    className="w-full text-left px-3 py-1 text-xs hover:bg-accent text-amber-600"
                    onClick={() => { setZoom(editorZoom); setShowZoomMenu(false) }}
                  >
                    プレビューをエディタに同期 ({Math.round(editorZoom * 100)}%)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <ToolbarButton onClick={() => setEditorZoom(clampZoom(editorZoom + 0.1))} disabled={editorZoom >= 3} title="ズームイン (⌘=)">
          <ZoomIn className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={toggleLivePreview}
          title={livePreviewEnabled ? 'ライブプレビューを閉じる' : 'ライブプレビューを表示'}
          active={livePreviewEnabled}
        >
          <Eye className="w-4 h-4" />
          <span className="text-xs ml-1">プレビュー</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => setPreviewMode(!previewMode)}
          title={previewMode ? 'プレビュー終了' : 'フルプレビュー'}
          active={previewMode}
        >
          {previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span className="text-xs ml-1">{previewMode ? '編集' : 'フルプレビュー'}</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={handleValidate}
          disabled={!hasTemplateId || isValidating}
          title="バリデーション実行"
          active={violationCount > 0}
        >
          {violationCount > 0
            ? <ShieldAlert className="w-4 h-4" />
            : <ShieldCheck className="w-4 h-4" />}
          <span className="text-xs ml-1">
            {isValidating ? '検証中...' : 'バリデート'}
          </span>
          {violationCount > 0 && !isValidating && (
            <span className="ml-1 text-xs bg-destructive text-destructive-foreground rounded-full px-1 min-w-[16px] text-center">
              {violationCount}
            </span>
          )}
        </ToolbarButton>

        <ToolbarButton onClick={handleExportPng} disabled={isExporting} title="現在のページをPNGでエクスポート">
          <FileImage className="w-4 h-4" />
          <span className="text-xs ml-1">{isExporting ? 'PNG...' : 'PNG'}</span>
        </ToolbarButton>

        <ToolbarButton onClick={handleExportPdf} disabled={isExporting} title="全ページをPDFでエクスポート">
          <FileText className="w-4 h-4" />
          <span className="text-xs ml-1">{isExporting ? 'PDF...' : 'PDF'}</span>
        </ToolbarButton>

        {hasTemplateId && backendConnected && (
          <ToolbarButton
            onClick={handleBackendPdf}
            disabled={isExporting}
            title="バックエンドでPDFを生成（サーバーサイドレンダリング）"
          >
            <FileText className="w-4 h-4" />
            <span className="text-xs ml-1">{isExporting ? 'PDF...' : 'BEで生成'}</span>
          </ToolbarButton>
        )}
      </div>
    </header>

    {/* DataBinding modal */}
    {showDataModal && (
      <DataBindingModal
        open={showDataModal}
        onClose={() => setShowDataModal(false)}
      />
    )}

    {/* Variants modal */}
    <VariantsModal
      open={showVariantsModal}
      onClose={() => setShowVariantsModal(false)}
    />

    {/* Save template dialog */}
    <SaveTemplateDialog
      open={showSaveDialog}
      onSave={handleSaveNew}
      onCancel={() => setShowSaveDialog(false)}
      defaultName={reportName}
      saving={isSavingNew}
    />

    {/* Template manager */}
    <TemplateManagerModal
      open={showManagerModal}
      onClose={() => setShowManagerModal(false)}
    />

    {/* Update from built-in template confirmation */}
    <ConfirmDialog
      open={showUpdateFromBuiltinConfirm}
      title="ビルトインテンプレートから更新"
      message={sourceTemplate
        ? `現在のレポートを最新のビルトインテンプレート「${sourceTemplate.name}」の定義で上書きします。これまでの変更は失われます。続行しますか？`
        : ''}
      confirmLabel="更新"
      confirmVariant="danger"
      onConfirm={handleUpdateFromBuiltin}
      onCancel={() => setShowUpdateFromBuiltinConfirm(false)}
    />

    {/* Export variant selector */}
    <ExportVariantDialog
      open={showVariantDialog}
      onSelect={(variant) => {
        setShowVariantDialog(false)
        void doExportPdf(variant)
      }}
      onCancel={() => setShowVariantDialog(false)}
    />
    </>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
}

function MenuButton({ onClick, disabled, icon, label }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon}
      {label}
    </button>
  )
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  active,
  ariaExpanded,
  ariaHasPopup,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  active?: boolean
  ariaExpanded?: boolean
  ariaHasPopup?: 'menu' | 'listbox' | 'dialog' | 'true'
}) {
  return (
    <Tooltip content={title} placement="bottom">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        aria-pressed={active !== undefined && ariaExpanded === undefined ? active : undefined}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHasPopup}
        className={cn(
          'flex items-center px-1.5 py-1 rounded text-sm transition-colors shrink-0',
          active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}
