import { toast } from 'sonner'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  SidebarResizeHandle,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
} from '@/components/common/SidebarResizeHandle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { useShallow } from 'zustand/shallow'
import { useReportStore, selectActivePageId, selectActivePage, flattenPageElements } from '@/store/reportStore'
import { historyTimerRef } from '@/store/historyTimer'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { ReportCanvas } from '@/components/canvas/ReportCanvas'
import { ElementPalette } from '@/components/sidebar/ElementPalette'
import { PropertiesPanel } from '@/components/sidebar/PropertiesPanel'
import { PagePanel } from '@/components/sidebar/PagePanel'
import { SchemaFieldsTab } from '@/components/sidebar/SchemaFieldsTab'
import { PageSettingsPanel } from '@/components/sidebar/PageSettingsPanel'
import { LoginModal } from '@/components/modals/LoginModal'
import { TemplateSelectionModal } from '@/components/modals/TemplateSelectionModal'
import { LayersPanel } from '@/components/sidebar/LayersPanel'
import { VersionHistoryPanel } from '@/components/sidebar/VersionHistoryPanel'
import { SubmitResponseModal } from '@/components/modals/SubmitResponseModal'
import { LivePreviewPanel } from '@/components/preview/PreviewModal'
import { PreviewPane } from '@/components/canvas/PreviewPane'
import { EditorStatusBar } from '@/components/common/EditorStatusBar'
import { EmptyCanvasOnboarding } from '@/components/canvas/EmptyCanvasOnboarding'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { cn } from '@/lib/utils'
import { getAutoSaveKey } from '@/lib/autoSaveKey'
import { saveReport } from '@/api/reportApi'
import { ChevronLeft, ChevronRight, LayoutTemplate, Layers, BookOpen, Database } from 'lucide-react'

type LeftTab = 'elements' | 'pages' | 'layers' | 'schema'
type RightTab = 'properties' | 'versions' | 'page'

const LEFT_TABS = [
  { id: 'elements', labelKey: 'app.tabs.elements', icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
  { id: 'layers',   labelKey: 'app.tabs.layers',   icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'pages',    labelKey: 'app.tabs.pages',    icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'schema',   labelKey: 'app.tabs.schema',   icon: <Database className="w-3.5 h-3.5" /> },
] as const satisfies readonly { id: LeftTab; labelKey: ParseKeys<'core'>; icon: React.ReactNode }[]

const RIGHT_TABS = [
  { id: 'properties', labelKey: 'app.tabs.properties' },
  { id: 'versions', labelKey: 'app.tabs.versions' },
  { id: 'page', labelKey: 'app.tabs.page' },
] as const satisfies readonly { id: RightTab; labelKey: ParseKeys<'core'> }[]

/** #439: stored sidebar width, clamped to the valid range (falls back to default). */
function readSidebarWidth(side: 'left' | 'right'): number {
  try {
    const raw = Number(localStorage.getItem(`rds.sidebarWidth.${side}`))
    if (Number.isFinite(raw) && raw >= SIDEBAR_MIN_WIDTH && raw <= SIDEBAR_MAX_WIDTH) return raw
  } catch { /* storage unavailable (private mode) */ }
  return SIDEBAR_DEFAULT_WIDTH
}

export default function App() {
  const { t } = useTranslation('core')
  const [leftTab, setLeftTab] = useState<LeftTab>('elements')
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  // Modal copy differs by entry point (#112 U-5): 新規作成/オンボーディングは
  // 「選ぶ」、ページ設定からは「変更」。
  const [templateModalMode, setTemplateModalMode] = useState<'new' | 'change'>('new')
  const openTemplateModal = useCallback((mode: 'new' | 'change') => {
    setTemplateModalMode(mode)
    setShowTemplateModal(true)
  }, [])
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  // #439: user-resizable sidebar widths, persisted per side
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => readSidebarWidth('left'))
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => readSidebarWidth('right'))
  const resizeSidebar = (side: 'left' | 'right', width: number) => {
    if (side === 'left') setLeftSidebarWidth(width)
    else setRightSidebarWidth(width)
    try { localStorage.setItem(`rds.sidebarWidth.${side}`, String(width)) } catch { /* private mode */ }
  }
  // #439: below ~1024px the three-pane layout gets cramped — show a dismissible hint
  const isSmallScreen = useMediaQuery('(max-width: 1023px)')
  const [smallScreenHintDismissed, setSmallScreenHintDismissed] = useState(false)
  const [autoSaveTime, setAutoSaveTime] = useState<string | null>(null)
  // Restore prompt: shown when a restorable autosave was found for the current
  // user and the user hasn't acted on it yet (復元する / 破棄 record the user id
  // in restoreHandledFor). Derived — no state syncing in effects.
  const [restoreHandledFor, setRestoreHandledFor] = useState<string | null>(null)
  const [showTemplateChangeConfirm, setShowTemplateChangeConfirm] = useState(false)
  // Onboarding dismissal is recorded per user id so a user change naturally
  // re-shows the guidance (no reset effect needed).
  const [onboardingDismissedBy, setOnboardingDismissedBy] = useState<{ userId: string | null } | null>(null)
  const [pendingTemplateDefinition, setPendingTemplateDefinition] = useState<Parameters<typeof loadReport>[0] | null>(null)
  // Server template id the pending definition should bind to once the user
  // confirms discarding unsaved changes (null = blank/builtin start). Kept
  // alongside pendingTemplateDefinition so the id is applied atomically with
  // loadReport across the confirm gate (#152).
  const [pendingTemplateSourceId, setPendingTemplateSourceId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const previewMode = useReportStore((s) => s.previewMode)
  const livePreviewEnabled = useReportStore((s) => s.livePreviewEnabled)
  const backendConnected = useReportStore((s) => s.backendConnected)
  const activePageId = useReportStore(selectActivePageId)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))

  const definition = useReportStore((s) => s.definition)
  // Document is "empty" when no page has any element — drives the onboarding overlay.
  const isDocumentEmpty = useMemo(
    () => definition.pages.every((p) => flattenPageElements(p).length === 0),
    [definition.pages],
  )
  const importReportJSON = useReportStore((s) => s.importReportJSON)
  const historyIndex = useReportStore((s) => s.historyIndex)
  const undo = useReportStore((s) => s.undo)
  const redo = useReportStore((s) => s.redo)
  const copyElements = useReportStore((s) => s.copyElements)
  const cutElements = useReportStore((s) => s.cutElements)
  const pasteElements = useReportStore((s) => s.pasteElements)
  const duplicateElement = useReportStore((s) => s.duplicateElement)
  const removeElements = useReportStore((s) => s.removeElements)
  const selectAll = useReportStore((s) => s.selectAll)
  const moveElement = useReportStore((s) => s.moveElement)
  const pushHistory = useReportStore((s) => s.pushHistory)
  const setZoom = useReportStore((s) => s.setZoom)
  const setEditorZoom = useReportStore((s) => s.setEditorZoom)
  const editorZoom = useReportStore((s) => s.editorZoom)
  const headerEditMode = useReportStore((s) => s.headerEditMode)
  const setHeaderEditMode = useReportStore((s) => s.setHeaderEditMode)
  const activePage = useReportStore(selectActivePage)
  const loadReport = useReportStore((s) => s.loadReport)
  const _ensureProductMasterGroup = useReportStore((s) => s.ensureProductMasterGroup)
  const handleTemplateChange = useCallback((definition: Parameters<typeof loadReport>[0], sourceTemplateId: string | null) => {
    if (historyIndex > 0) {
      setPendingTemplateDefinition(definition)
      setPendingTemplateSourceId(sourceTemplateId)
      setShowTemplateChangeConfirm(true)
      return
    }
    loadReport(definition)
    // Bind subsequent saves to the chosen template (or null for a blank/builtin
    // start, so 保存 creates a new template instead of overwriting the previously
    // open one — #152). Applied together with loadReport, never out-of-band.
    useReportStore.getState().setCurrentTemplateId(sourceTemplateId)
    _ensureProductMasterGroup()
    setShowTemplateModal(false)
  }, [loadReport, _ensureProductMasterGroup, historyIndex])
  const snapToGrid = useReportStore((s) => s.snapToGrid)
  const gridSize = useReportStore((s) => s.gridSize)

  // Clear current template on logout (prevent data leakage between users)
  const currentUser = useReportStore((s) => s.currentUser)
  const authLoading = useReportStore((s) => s.authLoading)

  // Auto-save to localStorage (debounced 1 second) — keyed by userId to prevent cross-user leakage
  const autoSaveKey = getAutoSaveKey(currentUser?.userId)
  useEffect(() => {
    if (historyIndex === 0 || !autoSaveKey) return // don't save pristine state or when logged out
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(autoSaveKey, JSON.stringify(definition))
        setAutoSaveTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
      } catch {
        // localStorage full or disabled — ignore silently
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [historyIndex, definition, autoSaveKey])

  // Autosave removal + template clear on logout live in authSlice.logoutUser
  // (post-logout cleanup runs for every logout path, no prev-user ref needed).

  // Check for a restorable autosave once per user, AFTER authentication resolves.
  // The autosave key is user-scoped (getAutoSaveKey(userId)); running this on bare
  // mount — before checkAuth populates currentUser — always computed a null key and
  // silently skipped the prompt, so unsaved work was never offered for restore on
  // reload (#160). The memo is keyed on the user id so the check runs exactly once
  // per user (localStorage reads are idempotent; the result is frozen until the
  // user changes — the buttons below hide the prompt via restoreHandledFor).
  const currentUserId = currentUser?.userId ?? null
  const restoreCandidate = useMemo(() => {
    if (!currentUserId) return false
    const key = getAutoSaveKey(currentUserId)
    const saved = key ? localStorage.getItem(key) : null
    // Read historyIndex at check-time (pristine editor only); it is not a dep.
    return !!saved && useReportStore.getState().historyIndex === 0
  }, [currentUserId])
  const showRestorePrompt = restoreCandidate && restoreHandledFor !== currentUserId

  // Authenticate on mount — restores existing session or flags as unauthenticated
  const checkAuth = useReportStore((s) => s.checkAuth)
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Onboarding dismissal is derived per user (see onboardingDismissedBy above),
  // so each user gets the empty-canvas guidance once per session.
  const onboardingDismissed =
    onboardingDismissedBy !== null && onboardingDismissedBy.userId === currentUserId

  // Tenant info is fetched by the auth flow (checkAuth on session-restore,
  // loginUser on login) — see authSlice. Fetching here on bare mount would run
  // before authentication and log a guaranteed 401.

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
      // デザインタブ以外ではキャンバスショートカットを無効化
      if (useReportStore.getState().activeTab !== 'design') return

      const meta = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      // Don't intercept when typing in inputs or in an inline text/contenteditable editor.
      // isContentEditable also covers IME composition inside the inline editor, where the
      // editor returns before stopPropagation — without this guard a composition Backspace
      // reaches here and deletes the element being edited (#211).
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return

      // Shift+z reports e.key as uppercase 'Z' — compare case-insensitively so
      // Cmd/Ctrl+Shift+Z (redo) actually fires (#212).
      const key = e.key.toLowerCase()
      if (meta && key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (meta && key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (meta && key === 'y') { e.preventDefault(); redo() }

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

      // Delete selected — single source of truth for element deletion (#211).
      // Batch removeElements → one undo entry (not N); ReportCanvas no longer duplicates this.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        if (activePageId && selectedIds.length > 0) {
          e.preventDefault()
          const count = selectedIds.length
          removeElements(activePageId, selectedIds)
          toast(t('app.elementsDeleted', { n: count }), {
            action: { label: t('app.undo'), onClick: () => undo() },
            duration: 5000,
          })
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
        // moveElement doesn't push history; debounce one commit so a burst of arrow-key
        // nudges (or a held key) collapses into a single undo step (#215).
        if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
        historyTimerRef.current = setTimeout(() => {
          historyTimerRef.current = null
          pushHistory()
        }, 300)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePageId, selectedIds, undo, redo, copyElements, cutElements, pasteElements,
    duplicateElement, removeElements, selectAll, setZoom, setEditorZoom, editorZoom, moveElement, pushHistory, activePage,
    snapToGrid, gridSize, headerEditMode, setHeaderEditMode, t])

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background text-foreground">
      <Toolbar
        canvasRefs={[canvasRef]}
        containerRef={canvasContainerRef}
        onRequestTemplateModal={() => openTemplateModal('new')}
      />

      {showRestorePrompt && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-xs">
          <span>{t('app.restore.message')}</span>
          <button
            onClick={() => {
              const saved = autoSaveKey ? localStorage.getItem(autoSaveKey) : null
              if (saved) importReportJSON(saved)
              setRestoreHandledFor(currentUserId)
            }}
            className="font-medium text-primary hover:underline"
          >
            {t('app.restore.restore')}
          </button>
          <button
            onClick={() => {
              if (autoSaveKey) localStorage.removeItem(autoSaveKey)
              setRestoreHandledFor(currentUserId)
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('app.restore.discard')}
          </button>
        </div>
      )}
      {autoSaveTime && !showRestorePrompt && (
        <div className="bg-muted/30 border-b px-4 py-1 text-[10px] text-muted-foreground">
          {t('app.autoSaved', { time: autoSaveTime })}
        </div>
      )}

      {/* #439: the editor layout assumes desktop widths — hint instead of breaking */}
      {isSmallScreen && !smallScreenHintDismissed && !previewMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1 text-[11px] text-amber-800 flex items-center gap-2">
          <span>{t('app.smallScreenHint')}</span>
          <button
            onClick={() => setSmallScreenHintDismissed(true)}
            className="ml-auto shrink-0 hover:text-amber-950"
            aria-label={t('app.smallScreenDismiss')}
          >
            ✕
          </button>
        </div>
      )}

      {previewMode ? (
        <LivePreviewPanel />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <aside
            className="relative border-r bg-card flex flex-col shrink-0 overflow-hidden"
            style={{ width: leftSidebarOpen ? leftSidebarWidth : 32 }}
          >
            {leftSidebarOpen && (
              <SidebarResizeHandle
                side="left"
                width={leftSidebarWidth}
                onResize={(w) => resizeSidebar('left', w)}
                ariaLabel={t('app.sidebar.resizeLeft')}
              />
            )}
            <div className="flex border-b overflow-x-auto shrink-0">
              {leftSidebarOpen && (
                <div
                  role="tablist"
                  aria-label={t('app.sidebar.leftNav')}
                  className="flex overflow-x-auto"
                  onKeyDown={(e) => {
                    const tabIds = LEFT_TABS.map((tab) => tab.id)
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
                        title={t(tab.labelKey)}
                        className={cn(
                          'shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                          isActive
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {tab.icon}
                        <span className="text-[9px] leading-tight">{t(tab.labelKey)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                onClick={() => setLeftSidebarOpen(v => !v)}
                className="ml-auto shrink-0 px-1 py-2 text-muted-foreground hover:text-foreground"
                title={leftSidebarOpen ? t('app.sidebar.collapse') : t('app.sidebar.expand')}
                aria-label={leftSidebarOpen ? t('app.sidebar.collapse') : t('app.sidebar.expand')}
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
                {leftTab === 'schema' && <SchemaFieldsTab />}
              </div>
            )}
          </aside>

          {/* Canvas Area */}
          <main className="flex-1 overflow-hidden bg-muted/10 flex flex-col">
            <div ref={canvasContainerRef} className="relative flex-1 overflow-hidden">
              <ReportCanvas canvasRef={canvasRef} />
              {/* Suppress the onboarding overlay while a restore prompt is showing so
                  the two "start here" affordances don't stack (#175). Once the user
                  acts on the restore banner it clears and onboarding can reappear. */}
              {isDocumentEmpty && !onboardingDismissed && !showRestorePrompt && (
                <EmptyCanvasOnboarding
                  onOpenTemplates={() => openTemplateModal('new')}
                  onDismiss={() => setOnboardingDismissedBy({ userId: currentUserId })}
                />
              )}
            </div>
            <EditorStatusBar containerRef={canvasContainerRef} />
          </main>

          {/* Live Preview Pane */}
          {livePreviewEnabled && <PreviewPane />}

          {/* Right Sidebar: Properties / Versions */}
          <aside
            className="relative border-l bg-card flex flex-col shrink-0 overflow-hidden"
            style={{ width: rightSidebarOpen ? rightSidebarWidth : 32 }}
          >
            {rightSidebarOpen && (
              <SidebarResizeHandle
                side="right"
                width={rightSidebarWidth}
                onResize={(w) => resizeSidebar('right', w)}
                ariaLabel={t('app.sidebar.resizeRight')}
              />
            )}
            <div className="flex border-b shrink-0">
              <button
                onClick={() => setRightSidebarOpen(v => !v)}
                className="shrink-0 px-1 py-2 text-muted-foreground hover:text-foreground"
                title={rightSidebarOpen ? t('app.sidebar.collapse') : t('app.sidebar.expand')}
                aria-label={rightSidebarOpen ? t('app.sidebar.collapse') : t('app.sidebar.expand')}
              >
                {rightSidebarOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
              </button>
              {rightSidebarOpen && (
                <div
                  role="tablist"
                  aria-label={t('app.sidebar.rightNav')}
                  className="flex overflow-x-auto"
                  onKeyDown={(e) => {
                    const tabIds = RIGHT_TABS.map((tab) => tab.id)
                    const currentIndex = tabIds.indexOf(rightTab)
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
                      setRightTab(tabIds[nextIndex])
                      document.getElementById(`right-tab-${tabIds[nextIndex]}`)?.focus()
                    }
                  }}
                >
                  {RIGHT_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={rightTab === tab.id}
                      aria-controls={`right-tabpanel-${tab.id}`}
                      id={`right-tab-${tab.id}`}
                      tabIndex={rightTab === tab.id ? 0 : -1}
                      onClick={() => setRightTab(tab.id)}
                      className={cn(
                        'shrink-0 px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap',
                        rightTab === tab.id
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(tab.labelKey)}
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
                {rightTab === 'page' && <PageSettingsPanel onTemplateChange={() => openTemplateModal('change')} />}
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
        title={templateModalMode === 'new' ? t('app.templateModal.titleNew') : t('app.templateModal.titleChange')}
        confirmLabel={templateModalMode === 'new' ? t('app.templateModal.confirmNew') : t('app.templateModal.confirmChange')}
      />
      <SubmitResponseModal />

      <ConfirmDialog
        open={showTemplateChangeConfirm}
        title={t('app.unsavedConfirm.title')}
        message={t('app.unsavedConfirm.message')}
        confirmLabel={t('app.unsavedConfirm.discardAndOpen')}
        confirmVariant="danger"
        // Offer a non-destructive "save first" path when an existing server
        // template is open (has an id to save to). A blank/unsaved-new draft has
        // no id, so only the discard path is shown there (#160).
        secondaryLabel={useReportStore.getState().currentTemplateId ? t('app.unsavedConfirm.saveAndOpen') : undefined}
        onSecondary={async () => {
          const { currentTemplateId, definition } = useReportStore.getState()
          if (currentTemplateId) {
            try {
              await saveReport(currentTemplateId, definition)
              toast.success(t('app.toast.saved'))
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t('app.toast.saveFailed'), { duration: 8000 })
              return // keep the dialog open so the user doesn't lose the pending switch
            }
          }
          if (pendingTemplateDefinition) {
            loadReport(pendingTemplateDefinition)
            useReportStore.getState().setCurrentTemplateId(pendingTemplateSourceId)
            _ensureProductMasterGroup()
            setShowTemplateModal(false)
          }
          setShowTemplateChangeConfirm(false)
          setPendingTemplateDefinition(null)
          setPendingTemplateSourceId(null)
        }}
        onConfirm={() => {
          if (pendingTemplateDefinition) {
            loadReport(pendingTemplateDefinition)
            // Apply the bound id atomically with the deferred load (#152).
            useReportStore.getState().setCurrentTemplateId(pendingTemplateSourceId)
            _ensureProductMasterGroup()
            setShowTemplateModal(false)
          }
          setShowTemplateChangeConfirm(false)
          setPendingTemplateDefinition(null)
          setPendingTemplateSourceId(null)
        }}
        onCancel={() => { setShowTemplateChangeConfirm(false); setPendingTemplateDefinition(null); setPendingTemplateSourceId(null) }}
      />

    </div>
  )
}
