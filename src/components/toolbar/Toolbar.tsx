import { useCallback, useState } from 'react'
import { useToolbarModals } from './useToolbarModals'
import { useToolbarExport } from './useToolbarExport'
import { useToolbarFile } from './useToolbarFile'
import { ToolbarDialogs } from './ToolbarDialogs'
import {
  Undo2, Redo2, Eye, FileImage, FileText, FileSpreadsheet,
  ZoomIn, ZoomOut, AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  BringToFront, SendToBack, Copy, Clipboard, Scissors,
  ArrowUpToLine, ArrowDownToLine,
  AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter,
  Layers, ChevronDown, FolderOpen, Save, FilePlus,
  ShieldCheck, ShieldAlert, Database, RefreshCw, User,
  Paintbrush, PaintBucket, Download,
} from 'lucide-react'
import { useReportStore, selectActivePageId, selectActivePage } from '@/store/reportStore'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { clampZoom, computeFitZoom } from '@/lib/zoomMath'
import { FitWidthIcon, FitPageIcon } from '@/components/common/zoomUtils'
import { Tooltip } from '@/components/common/Tooltip'
import { ToolbarViewMenu } from './ToolbarViewMenu'

interface Props {
  canvasRefs: React.RefObject<HTMLDivElement | null>[]
  /** Editor container ref — used to compute fit-width / fit-page zoom */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Callback to open the template selection modal (managed by App) */
  onRequestTemplateModal?: () => void
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

export function Toolbar({ canvasRefs, containerRef, onRequestTemplateModal }: Props) {
  const reportName = useReportStore((s) => s.definition.metadata.documentName)
  const setReportName = useReportStore((s) => s.setReportName)
  const undo = useReportStore((s) => s.undo)
  const redo = useReportStore((s) => s.redo)
  const historyIndex = useReportStore((s) => s.historyIndex)
  const historyLength = useReportStore((s) => s.history.length)

  const editorZoom = useReportStore((s) => s.editorZoom)
  const previewZoom = useReportStore((s) => s.previewZoom)
  const setZoom = useReportStore((s) => s.setZoom)
  const setEditorZoom = useReportStore((s) => s.setEditorZoom)
  const activePage = useReportStore(selectActivePage)
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

  // Style clipboard
  const copyStyle = useReportStore((s) => s.copyStyle)
  const pasteStyle = useReportStore((s) => s.pasteStyle)
  const styleClipboard = useReportStore((s) => s.styleClipboard)

  const masterHeader = useReportStore((s) => s.definition.masterHeader)
  const masterFooter = useReportStore((s) => s.definition.masterFooter)
  const setMasterHeader = useReportStore((s) => s.setMasterHeader)
  const setMasterFooter = useReportStore((s) => s.setMasterFooter)
  const sourceTemplateId = useReportStore((s) => s.definition.metadata.sourceTemplateId)
  const sourceTemplate = sourceTemplateId
    ? BUILTIN_TEMPLATES.find((t) => t.id === sourceTemplateId) ?? null
    : null

  const violationCount = useReportStore((s) => s.computedViolations.length)
  const hasTemplateId = useReportStore((s) => s.currentTemplateId !== null)
  const backendConnected = useReportStore((s) => s.backendConnected)
  const currentUser = useReportStore((s) => s.currentUser)
  const logoutUser = useReportStore((s) => s.logoutUser)

  const {
    showSaveDialog, setShowSaveDialog,
    isSavingNew, setIsSavingNew,
    showUserMenu, setShowUserMenu,
    showServerSettings, setShowServerSettings,
    showOpenMenu, setShowOpenMenu,
    showSaveMenu, setShowSaveMenu,
    showZoomMenu, setShowZoomMenu,
    showAlignMenu, setShowAlignMenu,
    showZOrderMenu, setShowZOrderMenu,
    showPreviewMenu, setShowPreviewMenu,
    showDataModal, setShowDataModal,
    showManagerModal, setShowManagerModal,
    showVariantDialog, setShowVariantDialog,
    showUpdateFromBuiltinConfirm, setShowUpdateFromBuiltinConfirm,
    showOpenLocalConfirm, setShowOpenLocalConfirm,
    showOpenServerConfirm, setShowOpenServerConfirm,
    showDeleteHeaderConfirm, setShowDeleteHeaderConfirm,
    showDeleteFooterConfirm, setShowDeleteFooterConfirm,
    showValidationWarnConfirm, setShowValidationWarnConfirm,
    validationWarnings, setValidationWarnings,
    fileInputRef,
    userMenuRef, openMenuRef, saveMenuRef, zoomMenuRef,
    alignMenuRef, zOrderMenuRef, previewMenuRef,
  } = useToolbarModals()

  const {
    isExporting,
    isPreviewingPdf,
    isValidating,
    doExportPdf,
    handleExportPdf,
    handleFullPreviewPdf,
    handleBackendPdf,
    handleExportPng,
    handleExportCsv,
    handleExportExcel,
    handleValidate,
  } = useToolbarExport({
    canvasRefs,
    reportName,
    pages,
    activePage,
    setShowVariantDialog,
    setShowValidationWarnConfirm,
    setValidationWarnings,
  })

  const hasSelection = selectedIds.length > 0
  const hasMultiSelection = selectedIds.length >= 2
  const singleId = selectedIds[0]
  const hasSingleSelection = selectedIds.length === 1

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

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false)

  const {
    handleNew: handleNewFn,
    handleUpdateFromBuiltin,
    handleOpenLocal,
    handleOpenServer,
    handleFileChange,
    handleToggleMasterHeader,
    handleToggleMasterFooter,
    handleDownloadJson,
    handleSave,
    handleSaveNew,
  } = useToolbarFile({
    reportName,
    backendConnected,
    hasUnsavedChanges,
    sourceTemplateId,
    masterHeader,
    masterFooter,
    headerEditMode,
    containerRef,
    fileInputRef,
    setShowSaveDialog,
    setIsSavingNew,
    setShowManagerModal,
    setShowOpenLocalConfirm,
    setShowOpenServerConfirm,
    setShowUpdateFromBuiltinConfirm,
    setShowDeleteHeaderConfirm,
    setShowDeleteFooterConfirm,
    setShowSaveMenu,
  })

  const handleNew = () => handleNewFn(onRequestTemplateModal)

  // Keyboard navigation for dropdown menus
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

  return (
    <>
    <header className="flex flex-col border-b bg-background shrink-0">
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
          accept=".json,.rds.json,.rds2.json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* ─── G1: ファイル操作 ─────────────────────────────────────── */}
        <GroupDivider />

        <ToolbarButton onClick={handleNew} title="新規作成">
          <FilePlus className="w-4 h-4" />
        </ToolbarButton>
        <div className="relative flex items-center" ref={openMenuRef}>
          <ToolbarButton onClick={handleOpenLocal} title="開く">
            <FolderOpen className="w-4 h-4" />
          </ToolbarButton>
          <button
            onClick={() => setShowOpenMenu((v) => !v)}
            className="h-7 px-0.5 rounded hover:bg-accent -ml-1"
            aria-expanded={showOpenMenu}
            aria-haspopup="menu"
            aria-label="開くメニュー"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          {showOpenMenu && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[210px] py-1">
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent" onClick={() => { handleOpenLocal(); setShowOpenMenu(false) }}>
                ローカルファイルを開く
              </button>
              <button
                className={cn('w-full text-left px-3 py-1.5 text-sm', backendConnected ? 'hover:bg-accent' : 'opacity-40 cursor-not-allowed')}
                disabled={!backendConnected}
                onClick={() => { handleOpenServer(); setShowOpenMenu(false) }}
              >
                サーバーから開く
              </button>
            </div>
          )}
        </div>
        {sourceTemplate && (
          <ToolbarButton
            onClick={() => setShowUpdateFromBuiltinConfirm(true)}
            title={`ビルトインテンプレート「${sourceTemplate.name}」から最新定義で更新`}
          >
            <RefreshCw className="w-4 h-4" />
          </ToolbarButton>
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
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent" onClick={() => { void handleSave(); setShowSaveMenu(false) }}>
                サーバーに保存
              </button>
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent" onClick={handleDownloadJson}>
                JSON ファイルとしてダウンロード
              </button>
            </div>
          )}
        </div>

        {/* ─── G2: 編集 ─────────────────────────────────────────────── */}
        <GroupDivider />

        <ToolbarButton onClick={undo} disabled={historyIndex < 1} title="元に戻す (⌘Z)">
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={redo} disabled={historyIndex >= historyLength - 1} title="やり直す (⌘⇧Z)">
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

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

        {/* Style copy / paste */}
        <ToolbarButton
          onClick={() => activePageId && singleId && copyStyle(activePageId, singleId)}
          disabled={!hasSingleSelection}
          title="スタイルをコピー"
          active={!!styleClipboard}
        >
          <Paintbrush className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => activePageId && pasteStyle(activePageId, selectedIds)}
          disabled={!hasSelection || !styleClipboard}
          title="スタイルを貼り付け"
        >
          <PaintBucket className="w-4 h-4" />
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

        {/* ─── G3: 表示・構造 ──────────────────────────────────────── */}
        <GroupDivider />

        <ToolbarButton onClick={() => setShowDataModal(true)} title="データ設定">
          <Database className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Advanced view/layout tools consolidated behind one dropdown (#111) */}
        <ToolbarViewMenu
          showGrid={showGrid}
          toggleGrid={toggleGrid}
          snapToGrid={snapToGrid}
          toggleSnapToGrid={toggleSnapToGrid}
          showTrimMarks={showTrimMarks}
          toggleTrimMarks={toggleTrimMarks}
          showMarginGuide={showMarginGuide}
          toggleMarginGuide={toggleMarginGuide}
          headerEditMode={headerEditMode}
          toggleHeaderEditMode={toggleHeaderEditMode}
          canEditHeaderFooter={!!masterHeader || !!masterFooter}
          hasMasterHeader={!!masterHeader}
          onToggleMasterHeader={handleToggleMasterHeader}
          hasMasterFooter={!!masterFooter}
          onToggleMasterFooter={handleToggleMasterFooter}
        />

        <div className="flex-1" />

        {/* ─── ズーム ──────────────────────────────────────────────── */}
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
              onFocus={(e) => { setInputZoom(String(Math.round(editorZoom * 100))); e.target.select(); setShowZoomMenu(false) }}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value.replace('%', ''))
                if (!isNaN(parsed) && parsed > 0) setEditorZoom(clampZoom(parsed / 100))
                setInputZoom(null)
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') {
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
                  className={cn('w-full text-left px-3 py-1 text-xs hover:bg-accent', editorZoom === z && 'bg-accent font-medium')}
                  onClick={() => { setEditorZoom(z); setShowZoomMenu(false) }}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
              {containerRef && activePage && (
                <>
                  <div className="border-t my-1" />
                  <button role="menuitem" aria-label="横幅フィット" title="横幅フィット" className="w-full flex justify-center px-3 py-1.5 hover:bg-accent"
                    onClick={() => { setEditorZoom(computeFitZoom(containerRef, activePage).fitWidth); setShowZoomMenu(false) }}>
                    <FitWidthIcon />
                  </button>
                  <button role="menuitem" aria-label="ページ全体フィット" title="ページ全体フィット" className="w-full flex justify-center px-3 py-1.5 hover:bg-accent"
                    onClick={() => { setEditorZoom(computeFitZoom(containerRef, activePage).fitPage); setShowZoomMenu(false) }}>
                    <FitPageIcon />
                  </button>
                </>
              )}
              {!zoomsMatch && (
                <>
                  <div className="border-t my-1" />
                  <button className="w-full text-left px-3 py-1 text-xs hover:bg-accent text-amber-600"
                    onClick={() => { setZoom(editorZoom); setShowZoomMenu(false) }}>
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

        {/* ─── G4: 出力 ────────────────────────────────────────────── */}
        <GroupDivider />

        {/* Preview */}
        <div className="relative flex items-center" ref={previewMenuRef}>
          <ToolbarButton
            onClick={toggleLivePreview}
            title={livePreviewEnabled ? 'プレビューを閉じる' : 'プレビューを表示'}
            active={livePreviewEnabled}
          >
            <Eye className="w-4 h-4" />
          </ToolbarButton>
          <button
            onClick={() => setShowPreviewMenu((v) => !v)}
            className="flex items-center justify-center min-w-[28px] h-7 px-1 rounded hover:bg-accent -ml-1"
            aria-expanded={showPreviewMenu}
            aria-haspopup="menu"
            aria-label="プレビューメニュー"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showPreviewMenu && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[180px] py-1">
              <button
                className={cn('w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2', livePreviewEnabled && 'text-primary font-medium')}
                onClick={() => { toggleLivePreview(); setShowPreviewMenu(false) }}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                プレビュー
                {livePreviewEnabled && <span className="ml-auto text-[10px]">✓</span>}
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2 disabled:opacity-50"
                onClick={() => { void handleFullPreviewPdf(); setShowPreviewMenu(false) }}
                disabled={isPreviewingPdf}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                {isPreviewingPdf ? 'PDF生成中...' : 'フルプレビュー（PDF）'}
              </button>
            </div>
          )}
        </div>

        {/* Validate */}
        <ToolbarButton
          onClick={handleValidate}
          disabled={!hasTemplateId || isValidating}
          title="バリデーション実行"
          active={violationCount > 0}
        >
          {violationCount > 0
            ? <ShieldAlert className="w-4 h-4" />
            : <ShieldCheck className="w-4 h-4" />}
          {violationCount > 0 && !isValidating && (
            <span className="ml-1 text-xs bg-destructive text-destructive-foreground rounded-full px-1 min-w-[16px] text-center">
              {violationCount}
            </span>
          )}
        </ToolbarButton>

        {/* Export dropdown — consolidated PNG / PDF / backend PDF */}
        <div className="relative">
          <ToolbarButton
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={isExporting}
            title="エクスポート"
            active={showExportMenu}
            ariaExpanded={showExportMenu}
            ariaHasPopup="menu"
          >
            <Download className="w-4 h-4" />
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </ToolbarButton>
          {showExportMenu && (
            <div role="menu" className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[200px] py-1" onKeyDown={handleMenuKeyDown}>
              <MenuButton
                onClick={() => { void handleExportPdf(); setShowExportMenu(false) }}
                disabled={isExporting}
                icon={<FileText className="w-4 h-4" />}
                label="PDF（全ページ・サーバー生成/ベクター）"
              />
              <MenuButton
                onClick={() => { void handleExportExcel(); setShowExportMenu(false) }}
                disabled={isExporting}
                icon={<FileSpreadsheet className="w-4 h-4" />}
                label="Excel（帳票データ・サーバー生成）"
              />
              <MenuButton
                onClick={() => { handleExportCsv(); setShowExportMenu(false) }}
                disabled={isExporting}
                icon={<FileSpreadsheet className="w-4 h-4" />}
                label="CSV（帳票データ）"
              />
              <MenuButton
                onClick={() => { handleExportPng(); setShowExportMenu(false) }}
                disabled={isExporting}
                icon={<FileImage className="w-4 h-4" />}
                label="PNG（現在のページ・画像）"
              />
              {hasTemplateId && backendConnected && (
                <>
                  <div className="border-t my-1" />
                  <MenuButton
                    onClick={() => { handleBackendPdf(); setShowExportMenu(false) }}
                    disabled={isExporting}
                    icon={<FileText className="w-4 h-4" />}
                    label="PDF（保存版テンプレートから）"
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        {currentUser && (
          <>
            <Divider />
            <div className="relative flex items-center" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-1.5 h-7 px-2 rounded hover:bg-accent text-xs"
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
                aria-label="ユーザーメニュー"
              >
                <User className="w-3.5 h-3.5" />
                <span className="max-w-[80px] truncate">{currentUser.displayName}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showUserMenu && (
                <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[140px] py-1">
                  <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                    onClick={() => { setShowServerSettings(true); setShowUserMenu(false) }}>
                    設定
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-red-600"
                    onClick={() => { void logoutUser(); setShowUserMenu(false) }}>
                    ログアウト
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>

    {/* All dialogs rendered via ToolbarDialogs — no duplicates here */}
    <ToolbarDialogs
      reportName={reportName}
      sourceTemplateName={sourceTemplate?.name}
      showDataModal={showDataModal}
      showServerSettings={showServerSettings}
      showSaveDialog={showSaveDialog}
      showManagerModal={showManagerModal}
      showUpdateFromBuiltinConfirm={showUpdateFromBuiltinConfirm}
      showVariantDialog={showVariantDialog}
      showValidationWarnConfirm={showValidationWarnConfirm}
      showOpenLocalConfirm={showOpenLocalConfirm}
      showOpenServerConfirm={showOpenServerConfirm}
      showDeleteHeaderConfirm={showDeleteHeaderConfirm}
      showDeleteFooterConfirm={showDeleteFooterConfirm}
      isSavingNew={isSavingNew}
      validationWarnings={validationWarnings}
      onCloseDataModal={() => setShowDataModal(false)}
      onCloseServerSettings={() => setShowServerSettings(false)}
      onSaveNew={handleSaveNew}
      onCancelSave={() => setShowSaveDialog(false)}
      onCloseManagerModal={() => setShowManagerModal(false)}
      onConfirmUpdateFromBuiltin={handleUpdateFromBuiltin}
      onCancelUpdateFromBuiltin={() => setShowUpdateFromBuiltinConfirm(false)}
      onSelectVariant={(variant) => { setShowVariantDialog(false); void doExportPdf(variant) }}
      onCancelVariantDialog={() => setShowVariantDialog(false)}
      onConfirmExportWithWarnings={() => { setShowValidationWarnConfirm(false); void handleExportPdf(true) }}
      onCancelValidationWarn={() => setShowValidationWarnConfirm(false)}
      onConfirmOpenLocal={() => { setShowOpenLocalConfirm(false); fileInputRef.current?.click() }}
      onCancelOpenLocal={() => setShowOpenLocalConfirm(false)}
      onConfirmOpenServer={() => { setShowOpenServerConfirm(false); setShowManagerModal(true) }}
      onCancelOpenServer={() => setShowOpenServerConfirm(false)}
      onConfirmDeleteHeader={() => { setShowDeleteHeaderConfirm(false); setMasterHeader(null); if (!masterFooter) setHeaderEditMode(false) }}
      onCancelDeleteHeader={() => setShowDeleteHeaderConfirm(false)}
      onConfirmDeleteFooter={() => { setShowDeleteFooterConfirm(false); setMasterFooter(null); if (!masterHeader) setHeaderEditMode(false) }}
      onCancelDeleteFooter={() => setShowDeleteFooterConfirm(false)}
    />
    </>
  )
}

/** 細いグループ内セパレーター */
function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
}

/** 太いグループ間セパレーター（視覚的なグルーピング用） */
function GroupDivider() {
  return <div className="w-px h-6 bg-border/60 mx-2 shrink-0" />
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
