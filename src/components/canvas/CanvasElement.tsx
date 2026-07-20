import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { ElementRenderer } from './ElementRenderer'
import { ElementErrorBoundary } from '@/elements/_blocks/renderers/ElementErrorBoundary'
import { TextInlineEditor } from '@/elements/text/InlineEditor'
import { mmToPx, pxToMm } from '@/lib/paperSizes'
import { constrainAspectRatio } from '@/lib/aspectRatioConstraint'
import { computeOverflowWarning } from '@/lib/overflowWarning'
import { useReportStore, selectActivePageId } from '@/store/reportStore'
import { clearHistoryTimer } from '@/store/historyTimer'
import type { ReportElement, FormTableElement, TextStyle } from '@/types'
import { EXPAND_OVERFLOW_TOLERANCE_PX, EXPAND_PADDING_MM } from '@/elements/_blocks/constants'
import { FormTableEditor } from '@/elements/formTable/FormTableEditor'

import type { ContextMenuState } from './ContextMenu'

interface Props {
  element: ReportElement
  isSelected: boolean
  /** True when this element is highlighted as a schema field/group drop target */
  isDropTarget?: boolean
  onSelect: (id: string, multi: boolean) => void
  onMove: (id: string, position: { x: number; y: number }) => void
  onResize: (id: string, size: { width: number; height: number }) => void
  onContextMenu?: (state: ContextMenuState) => void
  data?: Record<string, unknown>
  readonly?: boolean
  pageIndex?: number
  totalPages?: number
  computedValues?: Record<string, unknown>
  defaultTextStyle?: import('@/types').TextStyle
  /** Calculation-output keys — lifted to SectionContainer to avoid N subscriptions (#218) */
  calcOutputKeys?: Set<string>
}

type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w'

const CORNER_HANDLES = new Set<ResizeHandle>(['se', 'sw', 'ne', 'nw'])

export const CanvasElement = memo(function CanvasElement({
  element,
  isSelected,
  isDropTarget = false,
  onSelect,
  onMove,
  onResize,
  onContextMenu,
  data = {},
  readonly = false,
  pageIndex,
  totalPages,
  computedValues,
  defaultTextStyle,
  calcOutputKeys,
}: Props) {
  const removeElement = useReportStore((s) => s.removeElement)
  const updateElement = useReportStore((s) => s.updateElement)
  const pushHistory = useReportStore((s) => s.pushHistory)
  const activePageId = useReportStore(selectActivePageId)

  // Table edit mode state
  const [tableEditMode, setTableEditMode] = useState(false)

  // Live resize preview (#218): during a resize gesture the new geometry is kept in local
  // state and applied to THIS element's style only — the store is written once on pointerup,
  // instead of every pointermove (which produced ~120 store writes/sec that re-ran every
  // subscriber's selectors). A ref mirrors the latest value for the pointerup commit.
  const [resizePreview, setResizePreview] =
    useState<{ width: number; height: number; x: number; y: number } | null>(null)
  const resizePreviewRef = useRef<{ width: number; height: number; x: number; y: number } | null>(null)

  const handleDeleteElement = useCallback(
    (id: string) => {
      if (activePageId) removeElement(activePageId, id)
    },
    [activePageId, removeElement],
  )

  // Inline editing state — local only, never in store (auto-clears on unmount)
  const [editing, setEditing] = useState(false)
  // Ref to the outermost wrapper div for returning focus after editing
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: element.id,
    // Disable drag while editing so pointer events reach the contenteditable / cell grid
    disabled: element.locked || readonly || editing || tableEditMode,
  })

  // Exit table edit mode when element is deselected
  useEffect(() => {
    if (!isSelected && tableEditMode) setTableEditMode(false)
  }, [isSelected, tableEditMode])

  const handleTableChange = useCallback(
    (patch: Partial<FormTableElement>) => {
      if (activePageId) updateElement(activePageId, element.id, patch)
    },
    [activePageId, element.id, updateElement],
  )

  const handleExitTableEdit = useCallback(() => {
    setTableEditMode(false)
  }, [])

  // Data-overflow estimation (issue #55) — design mode only
  const overflowWarning = useMemo(
    () => (readonly ? null : computeOverflowWarning(element, data)),
    [readonly, element, data],
  )

  // UI-03: Track Ctrl/Meta key for locked element click-through
  const [modifierHeld, setModifierHeld] = useState(false)
  useEffect(() => {
    if (!element.locked || readonly) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.ctrlKey || e.metaKey) setModifierHeld(true) }
    const onKeyUp = () => setModifierHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onKeyUp)
    }
  }, [element.locked, readonly])

  const [resizing, setResizing] = useState<ResizeHandle | null>(null)
  const resizeStart = useRef<{
    mouseX: number
    mouseY: number
    widthMm: number
    heightMm: number
    xMm: number
    yMm: number
    ratio: number
  } | null>(null)

  // Keep a ref to element data so the resize closure doesn't capture a stale snapshot.
  // This removes `element` from the useCallback dependency array, making the handler stable.
  const elementRef = useRef(element)
  useEffect(() => {
    elementRef.current = element
  }, [element])

  // Current editor zoom, mirrored into a ref so the pointer-move resize handler always
  // reads the live value without re-subscribing or stale closures (#214).
  const editorZoom = useReportStore((s) => s.editorZoom)
  const zoomRef = useRef(editorZoom || 1)
  zoomRef.current = editorZoom || 1

  // Track resize cleanup so we can remove window listeners on unmount
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
      resizeCleanupRef.current = null
    }
  }, [])

  // onMove/onResize are stable useCallback refs from ReportCanvas — safe to list as deps
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      const el = elementRef.current
      if (readonly || el.locked) return
      e.stopPropagation()
      e.preventDefault()
      setResizing(handle)
      resizeStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        widthMm: el.size.width,
        heightMm: el.size.height,
        xMm: el.position.x,
        yMm: el.position.y,
        ratio: el.size.height > 0 ? el.size.width / el.size.height : 1,
      }

      const onPointerMove = (ev: PointerEvent) => {
        if (!resizeStart.current) return
        // The canvas renders under `transform: scale(zoom)`, so a screen-pixel delta is
        // zoom× the mm-space delta. Divide by the current editor zoom before converting to mm,
        // matching the drag-move path (ReportCanvas: `pxToMm(delta / zoom)`); otherwise the
        // handle tracks the cursor at the wrong speed whenever zoom ≠ 1 (#214).
        const zoom = zoomRef.current
        const dxMm = pxToMm((ev.clientX - resizeStart.current.mouseX) / zoom)
        const dyMm = pxToMm((ev.clientY - resizeStart.current.mouseY) / zoom)

        // Minimum size: 5mm
        const MIN_MM = 5

        let newWidthMm = resizeStart.current.widthMm
        let newHeightMm = resizeStart.current.heightMm
        let newXMm = resizeStart.current.xMm
        let newYMm = resizeStart.current.yMm

        if (handle.includes('e')) newWidthMm = Math.max(MIN_MM, resizeStart.current.widthMm + dxMm)
        if (handle.includes('s')) newHeightMm = Math.max(MIN_MM, resizeStart.current.heightMm + dyMm)
        if (handle.includes('w')) {
          newWidthMm = Math.max(MIN_MM, resizeStart.current.widthMm - dxMm)
          newXMm = resizeStart.current.xMm + resizeStart.current.widthMm - newWidthMm
        }
        if (handle.includes('n')) {
          newHeightMm = Math.max(MIN_MM, resizeStart.current.heightMm - dyMm)
          newYMm = resizeStart.current.yMm + resizeStart.current.heightMm - newHeightMm
        }

        // Shift+corner: maintain aspect ratio
        if (ev.shiftKey && CORNER_HANDLES.has(handle)) {
          const { ratio } = resizeStart.current
          const constrained = constrainAspectRatio(
            newWidthMm, newHeightMm,
            resizeStart.current.widthMm, resizeStart.current.heightMm,
            ratio,
          )
          newWidthMm = constrained.width
          newHeightMm = constrained.height
          // Recompute anchor coords for n/w handles after ratio adjustment
          if (handle.includes('w')) newXMm = resizeStart.current.xMm + resizeStart.current.widthMm - newWidthMm
          if (handle.includes('n')) newYMm = resizeStart.current.yMm + resizeStart.current.heightMm - newHeightMm
        }

        // Preview locally (no store write per frame — #218). Committed on pointerup.
        const preview = { width: newWidthMm, height: newHeightMm, x: newXMm, y: newYMm }
        resizePreviewRef.current = preview
        setResizePreview(preview)
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        resizeCleanupRef.current = null
      }

      const onPointerUp = () => {
        const el = elementRef.current
        const preview = resizePreviewRef.current
        if (preview) {
          // Commit the whole gesture as a single store write + one history entry (#215, #218).
          onResize(el.id, { width: preview.width, height: preview.height })
          if (handle.includes('w') || handle.includes('n')) {
            onMove(el.id, { x: preview.x, y: preview.y })
          }
          clearHistoryTimer()
          pushHistory()
        }
        resizePreviewRef.current = null
        setResizePreview(null)
        setResizing(null)
        resizeStart.current = null
        cleanup()
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)

      resizeCleanupRef.current = cleanup
    },
    // element is intentionally excluded — read from elementRef.current inside the handler
    [onMove, onResize, pushHistory, readonly],
  )

  // --- expandFrame: auto-grow element height to fit text content ---
  const textFit = getTextFit(element)
  const contentRef = useRef<HTMLDivElement>(null)
  const expandPending = useRef(false)

  useEffect(() => {
    if (textFit !== 'expandFrame') return
    const el = contentRef.current
    if (!el || !activePageId || expandPending.current) return

    // Measure actual content height vs current element height
    const contentHeightPx = el.scrollHeight
    const elementHeightPx = mmToPx(element.size.height)

    // Only update if content overflows beyond tolerance to avoid oscillation
    if (contentHeightPx > elementHeightPx + EXPAND_OVERFLOW_TOLERANCE_PX) {
      expandPending.current = true
      const newHeightMm = pxToMm(contentHeightPx) + EXPAND_PADDING_MM
      updateElement(activePageId, element.id, {
        size: { width: element.size.width, height: newHeightMm },
      })
      // Allow next check after the store update has rendered
      requestAnimationFrame(() => { expandPending.current = false })
    }
  }, [textFit, element.size.height, element.size.width, element.id, activePageId, updateElement])

  // Convert mm → px for rendering. During a resize gesture, use the local preview so only
  // this element re-renders (the store is untouched until pointerup — #218).
  const effX = resizePreview?.x ?? element.position.x
  const effY = resizePreview?.y ?? element.position.y
  const effW = resizePreview?.width ?? element.size.width
  const effH = resizePreview?.height ?? element.size.height
  const xPx = mmToPx(effX) + (transform?.x ?? 0)
  const yPx = mmToPx(effY) + (transform?.y ?? 0)
  const widthPx = mmToPx(effW)
  const heightPx = mmToPx(effH)

  const handles: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

  // Enter inline edit mode for text elements (double-click or F2)
  const enterEditMode = useCallback(() => {
    if (element.type !== 'text' || element.locked || readonly || isDragging) return
    setEditing(true)
  }, [element.type, element.locked, readonly, isDragging])

  // Commit edited content and exit edit mode
  const handleInlineCommit = useCallback(
    (content: string) => {
      if (activePageId) updateElement(activePageId, element.id, { content } as Partial<ReportElement>)
      setEditing(false)
      // Return focus to wrapper so keyboard navigation continues from this element
      requestAnimationFrame(() => wrapperRef.current?.focus())
    },
    [activePageId, element.id, updateElement],
  )

  const handleInlineCancel = useCallback(() => {
    setEditing(false)
    requestAnimationFrame(() => wrapperRef.current?.focus())
  }, [])

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      data-canvas-element="true"
      data-element-id={element.id}
      data-element-type={element.type}
      style={{
        position: 'absolute',
        left: xPx,
        top: yPx,
        width: widthPx,
        height: heightPx,
        zIndex: element.zIndex,
        opacity: isDragging ? 0.6 : 1,
        cursor: element.locked || readonly ? 'default' : 'move',
        pointerEvents: element.locked && modifierHeld ? 'none' : undefined,
        userSelect: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!readonly) onSelect(element.id, e.metaKey || e.ctrlKey || e.shiftKey)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (readonly || element.locked) return
        if (element.type === 'formTable') {
          e.preventDefault()
          setTableEditMode(true)
        } else {
          enterEditMode()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(element.id, e.metaKey || e.ctrlKey || e.shiftKey)
        }
        // F2: enter inline edit mode for selected text elements (WCAG 2.1 SC 2.1.1)
        if (e.key === 'F2' && isSelected) {
          e.preventDefault()
          enterEditMode()
        }
      }}
      onContextMenu={(e) => {
        if (readonly) return
        e.preventDefault()
        e.stopPropagation()
        // Only change selection if the right-clicked element is not already selected.
        // Preserves multi-selection when the user right-clicks any selected element.
        if (!isSelected) onSelect(element.id, false)
        onContextMenu?.({
          x: e.clientX,
          y: e.clientY,
          elementId: element.id,
          isLocked: element.locked,
          isVisible: element.visible,
        })
      }}
      // Remove dnd-kit listeners from DOM while editing so pointer events reach the editor
      {...(!readonly && !element.locked && !editing && !tableEditMode ? { ...listeners, ...attributes } : {})}
      role={editing ? 'textbox' : 'button'}
      tabIndex={readonly ? -1 : 0}
      aria-label={element.name ? `${element.name} (${element.type})` : element.type}
      aria-pressed={editing ? undefined : isSelected}
    >
      <ElementErrorBoundary elementId={element.id} elementType={element.type} onDelete={handleDeleteElement}>
        <div
          ref={contentRef}
          style={{
            width: '100%',
            height: '100%',
            overflow: textFit === 'expandFrame' ? 'visible' : undefined,
          }}
        >
          {tableEditMode && element.type === 'formTable' ? (
            <FormTableEditor
              element={element as FormTableElement}
              onChange={handleTableChange}
              onExitEditMode={handleExitTableEdit}
            />
          ) : editing && element.type === 'text' ? (
            <TextInlineEditor
              element={element}
              onCommit={handleInlineCommit}
              onCancel={handleInlineCancel}
            />
          ) : (
            <ElementRenderer element={element} data={data} readonly={readonly} pageIndex={pageIndex} totalPages={totalPages} computedValues={computedValues} defaultTextStyle={defaultTextStyle} calcOutputKeys={calcOutputKeys} />
          )}
        </div>
      </ElementErrorBoundary>

      {/* Data-overflow warning badge (issue #55) — records clipped by the frame */}
      {!readonly && overflowWarning && (
        <div
          className="absolute top-0.5 right-0.5 pointer-events-none px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500 text-white whitespace-nowrap"
          style={{ zIndex: 9997 }}
          role="status"
          title={`データ ${overflowWarning.intended} 件のうち ${overflowWarning.visible} 件のみ表示されます。要素の高さを広げるか、最大表示件数を調整してください（サーバPDF出力ではページ分割されます）`}
        >
          ⚠ {overflowWarning.visible}/{overflowWarning.intended}件
        </div>
      )}

      {/* Drop target highlight overlay — shown when dragging a schema field/group over this element */}
      {isDropTarget && (
        <div
          className="absolute inset-0 pointer-events-none ring-2 ring-indigo-500 ring-offset-0 bg-indigo-500/10 rounded-sm"
          style={{ zIndex: 9998 }}
        >
          <div className="absolute top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-500 text-white whitespace-nowrap">
            列を追加
          </div>
        </div>
      )}

      {isSelected && !readonly && (
        <>
          <div
            className={cn(
              'absolute inset-0 pointer-events-none',
              'ring-2 ring-blue-500 ring-offset-0',
            )}
          />
          {handles.map((handle) => (
            <ResizeHandleEl
              key={handle}
              handle={handle}
              isActive={resizing === handle}
              onPointerDown={(e) => handleResizeStart(e, handle)}
            />
          ))}
        </>
      )}
    </div>
  )
})

const RESIZE_HANDLE_STYLES: Record<ResizeHandle, React.CSSProperties> = {
  n: { top: -4, left: 'calc(50% - 4px)', cursor: 'n-resize' },
  s: { bottom: -4, left: 'calc(50% - 4px)', cursor: 's-resize' },
  e: { right: -4, top: 'calc(50% - 4px)', cursor: 'e-resize' },
  w: { left: -4, top: 'calc(50% - 4px)', cursor: 'w-resize' },
  ne: { top: -4, right: -4, cursor: 'ne-resize' },
  nw: { top: -4, left: -4, cursor: 'nw-resize' },
  se: { bottom: -4, right: -4, cursor: 'se-resize' },
  sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
}

/** Extract textFit from any element that has a TextStyle */
function getTextFit(element: ReportElement): TextStyle['textFit'] {
  if ('style' in element && element.style && typeof element.style === 'object' && 'textFit' in element.style) {
    return (element.style as TextStyle).textFit
  }
  return undefined
}

const ResizeHandleEl = memo(function ResizeHandleEl({
  handle,
  isActive,
  onPointerDown,
}: {
  handle: ResizeHandle
  isActive: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width: 8,
        height: 8,
        background: isActive ? '#2563eb' : '#ffffff',
        border: '1.5px solid #3b82f6',
        borderRadius: 2,
        zIndex: 9999,
        ...RESIZE_HANDLE_STYLES[handle],
      }}
      data-resize-handle={handle}
      onPointerDown={onPointerDown}
    />
  )
})
