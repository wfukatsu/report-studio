import { useEffect, useRef, useState, useCallback } from 'react'
import { useShallow } from 'zustand/shallow'
import { useReportStore, selectActivePageId, selectActivePage, flattenPageElements } from '@/store/reportStore'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { ReportCanvas } from '@/components/canvas/ReportCanvas'
import { ElementPalette } from '@/components/sidebar/ElementPalette'
import { PropertiesPanel } from '@/components/sidebar/PropertiesPanel'
import { PagePanel } from '@/components/sidebar/PagePanel'
import { PageSettingsPanel } from '@/components/sidebar/PageSettingsPanel'
import { LoginModal } from '@/components/modals/LoginModal'
import { TemplateSelectionModal } from '@/components/modals/TemplateSelectionModal'
import { LayersPanel } from '@/components/sidebar/LayersPanel'
import { SchemaPanel } from '@/components/sidebar/SchemaPanel'
import { ResponsesPanel } from '@/components/sidebar/ResponsesPanel'
import { DataBindingOverviewPanel } from '@/components/sidebar/DataBindingOverviewPanel'
import { VersionHistoryPanel } from '@/components/sidebar/VersionHistoryPanel'
import { SubmitResponseModal } from '@/components/modals/SubmitResponseModal'
import { LivePreviewPanel } from '@/components/preview/PreviewModal'
import { PreviewPane } from '@/components/canvas/PreviewPane'
import { EditorStatusBar } from '@/components/common/EditorStatusBar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useConnectionState } from '@/hooks/useConnectionState'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, LayoutTemplate, Database, Layers, BookOpen, MessageSquare, Link2 } from 'lucide-react'

type LeftTab = 'elements' | 'pages' | 'layers' | 'schema' | 'responses' | 'data'
type RightTab = 'properties' | 'versions' | 'page'

const LEFT_TABS: { id: LeftTab; label: string; icon: React.ReactNode }[] = [
  { id: 'elements',  label: '要素',    icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
  { id: 'schema',    label: 'スキーマ', icon: <Database className="w-3.5 h-3.5" /> },
  { id: 'layers',    label: 'レイヤー', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'pages',     label: 'ページ',   icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'responses', label: '回答',    icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { id: 'data',      label: 'データ',   icon: <Link2 className="w-3.5 h-3.5" /> },
]

const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: 'properties', label: 'プロパティ' },
  { id: 'versions', label: 'バージョン' },
  { id: 'page', label: 'ページ設定' },
]

export default function App() {
  const [leftTab, setLeftTab] = useState<LeftTab>('elements')
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [deleteToast, setDeleteToast] = useState<{ count: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [autoSaveTime, setAutoSaveTime] = useState<string | null>(null)
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [showTemplateChangeConfirm, setShowTemplateChangeConfirm] = useState(false)
  const [pendingTemplateDefinition, setPendingTemplateDefinition] = useState<Parameters<typeof loadReport>[0] | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // Start backend health-check polling (sets backendConnected in store)
  useConnectionState()

  const previewMode = useReportStore((s) => s.previewMode)
  const livePreviewEnabled = useReportStore((s) => s.livePreviewEnabled)
  const backendConnected = useReportStore((s) => s.backendConnected)
  const activePageId = useReportStore(selectActivePageId)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))

  const definition = useReportStore((s) => s.definition)
  const importReportJSON = useReportStore((s) => s.importReportJSON)
  const historyIndex = useReportStore((s) => s.historyIndex)
  const undo = useReportStore((s) => s.undo)
  const redo = useReportStore((s) => s.redo)
  const copyElements = useReportStore((s) => s.copyElements)
  const cutElements = useReportStore((s) => s.cutElements)
  const pasteElements = useReportStore((s) => s.pasteElements)
  const duplicateElement = useReportStore((s) => s.duplicateElement)
  const removeElement = useReportStore((s) => s.removeElement)
  const selectAll = useReportStore((s) => s.selectAll)
  const moveElement = useReportStore((s) => s.moveElement)
  const setZoom = useReportStore((s) => s.setZoom)
  const setEditorZoom = useReportStore((s) => s.setEditorZoom)
  const editorZoom = useReportStore((s) => s.editorZoom)
  const headerEditMode = useReportStore((s) => s.headerEditMode)
  const setHeaderEditMode = useReportStore((s) => s.setHeaderEditMode)
  const activePage = useReportStore(selectActivePage)
  const loadReport = useReportStore((s) => s.loadReport)
  const _ensureProductMasterGroup = useReportStore((s) => s.ensureProductMasterGroup)
  const handleTemplateChange = useCallback((definition: Parameters<typeof loadReport>[0]) => {
    if (historyIndex > 0) {
      setPendingTemplateDefinition(definition)
      setShowTemplateChangeConfirm(true)
      return
    }
    loadReport(definition)
    _ensureProductMasterGroup()
    setShowTemplateModal(false)
  }, [loadReport, _ensureProductMasterGroup, historyIndex])
  const snapToGrid = useReportStore((s) => s.snapToGrid)
  const gridSize = useReportStore((s) => s.gridSize)

  // Auto-save to localStorage (debounced 1 second)
  useEffect(() => {
    if (historyIndex === 0) return // don't save pristine state
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('rds-autosave', JSON.stringify(definition))
        setAutoSaveTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
      } catch {
        // localStorage full or disabled — ignore silently
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [historyIndex, definition])

  // Check for restore on mount — intentionally runs once; historyIndex is a
  // mount-time check only, not a reactive dependency.
  useEffect(() => {
    const saved = localStorage.getItem('rds-autosave')
    if (saved && historyIndex === 0) {
      setShowRestorePrompt(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Authenticate on mount — restores existing session or flags as unauthenticated
  const checkAuth = useReportStore((s) => s.checkAuth)
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Clear current template on logout (prevent data leakage between users)
  const currentUser = useReportStore((s) => s.currentUser)
  const authLoading = useReportStore((s) => s.authLoading)
  const setCurrentTemplateId = useReportStore((s) => s.setCurrentTemplateId)
  const newReport = useReportStore((s) => s.newReport)
  const prevUserRef = useRef<string | null>(null)
  useEffect(() => {
    const prevUserId = prevUserRef.current
    const currUserId = currentUser?.userId ?? null
    prevUserRef.current = currUserId
    // Only clear if we transitioned from logged-in to logged-out
    if (prevUserId !== null && currUserId === null) {
      setCurrentTemplateId(null)
      newReport()
    }
  }, [currentUser, setCurrentTemplateId, newReport])

  // Fetch tenant info on mount (best-effort; elements show fallback if unavailable)
  const fetchTenantInfo = useReportStore((s) => s.fetchTenantInfo)
  useEffect(() => {
    fetchTenantInfo()
  }, [fetchTenantInfo])

  // Ensure __productMaster__ system group exists in schema on mount
  const ensureProductMasterGroup = useReportStore((s) => s.ensureProductMasterGroup)
  useEffect(() => {
    ensureProductMasterGroup()
  }, [ensureProductMasterGroup])

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (historyIndex > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [historyIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      // Don't intercept when typing in inputs
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (meta && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (meta && e.key === 'y') { e.preventDefault(); redo() }

      if (meta && e.key === 'c') {
        if (activePageId && selectedIds.length > 0) {
          e.preventDefault(); copyElements(activePageId, selectedIds)
        }
      }
      if (meta && e.key === 'x') {
        if (activePageId && selectedIds.length > 0) {
          e.preventDefault(); cutElements(activePageId, selectedIds)
        }
      }
      if (meta && e.key === 'v') {
        if (activePageId) {
          e.preventDefault()
          pasteElements(activePageId)
          requestAnimationFrame(() => {
            const ids = useReportStore.getState().selection.selectedElementIds
            if (ids.length > 0) {
              const el = document.querySelector(`[data-element-id="${ids[0]}"]`)
              el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
            }
          })
        }
      }
      if (meta && e.key === 'd') {
        if (activePageId && selectedIds.length === 1) {
          e.preventDefault(); duplicateElement(activePageId, selectedIds[0])
        }
      }
      if (meta && e.key === 'a') {
        if (activePageId) { e.preventDefault(); selectAll(activePageId) }
      }

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        if (activePageId && selectedIds.length > 0) {
          e.preventDefault()
          const count = selectedIds.length
          selectedIds.forEach((id) => removeElement(activePageId, id))
          if (deleteToast) clearTimeout(deleteToast.timer)
          const timer = setTimeout(() => setDeleteToast(null), 3000)
          setDeleteToast({ count, timer })
        }
      }

      // Zoom keyboard shortcuts — editor only
      if (meta && e.key === '=') { e.preventDefault(); setEditorZoom(editorZoom + 0.1) }
      if (meta && e.key === '-') { e.preventDefault(); setEditorZoom(editorZoom - 0.1) }
      if (meta && e.key === '0') { e.preventDefault(); setEditorZoom(1) }

      // H/F edit mode — exit with Escape
      if (e.key === 'Escape' && headerEditMode) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          setHeaderEditMode(false)
        }
      }

      // Arrow key nudge
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !meta && activePageId && selectedIds.length > 0 && activePage) {
        e.preventDefault()
        const nudge = e.shiftKey ? 5 : 1
        const elements = flattenPageElements(activePage)
        selectedIds.forEach((id) => {
          const el = elements.find((elem) => elem.id === id)
          if (!el) return
          const dx = e.key === 'ArrowLeft' ? -nudge : e.key === 'ArrowRight' ? nudge : 0
          const dy = e.key === 'ArrowUp' ? -nudge : e.key === 'ArrowDown' ? nudge : 0
          const snapVal = (v: number) => snapToGrid ? Math.round(v / gridSize) * gridSize : v
          moveElement(activePageId, id, { x: snapVal(el.position.x + dx), y: snapVal(el.position.y + dy) })
        })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePageId, selectedIds, undo, redo, copyElements, cutElements, pasteElements,
    duplicateElement, removeElement, selectAll, setZoom, setEditorZoom, editorZoom, moveElement, activePage, deleteToast,
    snapToGrid, gridSize, headerEditMode, setHeaderEditMode])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <Toolbar
        canvasRefs={[canvasRef]}
        containerRef={canvasContainerRef}
        onRequestTemplateModal={() => setShowTemplateModal(true)}
      />

      {showRestorePrompt && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-xs">
          <span>前回の作業内容が自動保存されています。</span>
          <button
            onClick={() => {
              const saved = localStorage.getItem('rds-autosave')
              if (saved) importReportJSON(saved)
              setShowRestorePrompt(false)
            }}
            className="font-medium text-primary hover:underline"
          >
            復元する
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('rds-autosave')
              setShowRestorePrompt(false)
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            破棄
          </button>
        </div>
      )}
      {autoSaveTime && !showRestorePrompt && (
        <div className="bg-muted/30 border-b px-4 py-1 text-[10px] text-muted-foreground">
          自動保存済み {autoSaveTime}
        </div>
      )}

      {previewMode ? (
        <LivePreviewPanel />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <aside className={cn('border-r bg-card flex flex-col shrink-0 overflow-hidden transition-all', leftSidebarOpen ? 'w-64' : 'w-8')}>
            <div className="flex border-b overflow-x-auto shrink-0">
              {leftSidebarOpen && (
                <div
                  role="tablist"
                  aria-label="サイドバーナビゲーション"
                  className="flex overflow-x-auto"
                  onKeyDown={(e) => {
                    const tabIds = LEFT_TABS.map((t) => t.id)
                    const currentIndex = tabIds.indexOf(leftTab)
                    let nextIndex: number | null = null
                    if (e.key === 'ArrowRight') {
                      nextIndex = (currentIndex + 1) % tabIds.length
                    } else if (e.key === 'ArrowLeft') {
                      nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
                    } else if (e.key === 'Home') {
                      nextIndex = 0
                    } else if (e.key === 'End') {
                      nextIndex = tabIds.length - 1
                    }
                    if (nextIndex !== null) {
                      e.preventDefault()
                      setLeftTab(tabIds[nextIndex])
                      const nextTabEl = document.getElementById(`tab-${tabIds[nextIndex]}`)
                      nextTabEl?.focus()
                    }
                  }}
                >
                  {LEFT_TABS.map((tab) => {
                    const isActive = leftTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab.id}`}
                        id={`tab-${tab.id}`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => setLeftTab(tab.id)}
                        title={tab.label}
                        className={cn(
                          'shrink-0 flex items-center gap-1 py-2 text-xs font-medium transition-colors whitespace-nowrap',
                          isActive
                            ? 'border-b-2 border-primary text-primary px-2'
                            : 'text-muted-foreground hover:text-foreground px-2',
                        )}
                      >
                        {tab.icon}
                        {isActive && <span>{tab.label}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                onClick={() => setLeftSidebarOpen(v => !v)}
                className="ml-auto shrink-0 px-1 py-2 text-muted-foreground hover:text-foreground"
                title={leftSidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
                aria-label={leftSidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
              >
                {leftSidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            </div>
            {leftSidebarOpen && (
              <div
                role="tabpanel"
                id={`tabpanel-${leftTab}`}
                aria-labelledby={`tab-${leftTab}`}
                className="flex-1 overflow-y-auto"
              >
                {leftTab === 'elements' && <ElementPalette />}
                {leftTab === 'layers' && <LayersPanel />}
                {leftTab === 'pages' && <PagePanel />}
                {leftTab === 'schema' && <SchemaPanel />}
                {leftTab === 'responses' && <ResponsesPanel />}
                {leftTab === 'data' && <DataBindingOverviewPanel />}
              </div>
            )}
          </aside>

          {/* Canvas Area */}
          <main className="flex-1 overflow-hidden bg-muted/30 flex flex-col">
            <div ref={canvasContainerRef} className="flex-1 overflow-hidden">
              <ReportCanvas canvasRef={canvasRef} />
            </div>
            <EditorStatusBar containerRef={canvasContainerRef} />
          </main>

          {/* Live Preview Pane */}
          {livePreviewEnabled && <PreviewPane />}

          {/* Right Sidebar: Properties / Versions */}
          <aside className={cn('border-l bg-card flex flex-col shrink-0 overflow-hidden transition-all', rightSidebarOpen ? 'w-64' : 'w-8')}>
            <div className="flex border-b shrink-0">
              <button
                onClick={() => setRightSidebarOpen(v => !v)}
                className="shrink-0 px-1 py-2 text-muted-foreground hover:text-foreground"
                title={rightSidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
                aria-label={rightSidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
              >
                {rightSidebarOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
              </button>
              {rightSidebarOpen && (
                <div
                  role="tablist"
                  aria-label="右サイドバーナビゲーション"
                  className="flex overflow-x-auto"
                >
                  {RIGHT_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={rightTab === tab.id}
                      aria-controls={`right-tabpanel-${tab.id}`}
                      id={`right-tab-${tab.id}`}
                      onClick={() => setRightTab(tab.id)}
                      className={cn(
                        'shrink-0 px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap',
                        rightTab === tab.id
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {rightSidebarOpen && (
              <div
                role="tabpanel"
                id={`right-tabpanel-${rightTab}`}
                aria-labelledby={`right-tab-${rightTab}`}
                className="flex-1 overflow-y-auto"
              >
                {rightTab === 'properties' && <PropertiesPanel />}
                {rightTab === 'versions' && <VersionHistoryPanel />}
                {rightTab === 'page' && <PageSettingsPanel onTemplateChange={() => setShowTemplateModal(true)} />}
              </div>
            )}
          </aside>
        </div>
      )}
      {/* Login modal — shown when backendConnected but not authenticated */}
      {!currentUser && !authLoading && backendConnected && <LoginModal />}
      <TemplateSelectionModal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelect={handleTemplateChange}
        title="テンプレートを変更"
        confirmLabel="変更"
      />
      <SubmitResponseModal />

      <ConfirmDialog
        open={showTemplateChangeConfirm}
        title="未保存の変更があります"
        message="テンプレートを変更すると現在の変更が失われます。続けますか？"
        confirmLabel="変更"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingTemplateDefinition) {
            loadReport(pendingTemplateDefinition)
            _ensureProductMasterGroup()
            setShowTemplateModal(false)
          }
          setShowTemplateChangeConfirm(false)
          setPendingTemplateDefinition(null)
        }}
        onCancel={() => { setShowTemplateChangeConfirm(false); setPendingTemplateDefinition(null) }}
      />

      {deleteToast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3 text-sm z-50">
          <span>{deleteToast.count}件の要素を削除しました</span>
          <button
            onClick={() => { undo(); setDeleteToast(null) }}
            className="text-primary hover:underline text-xs font-medium"
          >
            元に戻す
          </button>
        </div>
      )}
    </div>
  )
}
