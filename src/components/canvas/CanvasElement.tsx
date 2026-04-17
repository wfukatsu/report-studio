import { memo, useRef, useState, useCallback, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { ElementRenderer } from './ElementRenderer'
import { ElementErrorBoundary } from './ElementErrorBoundary'
import { TextInlineEditor } from '@/elements/text/InlineEditor'
import { mmToPx, pxToMm } from '@/lib/paperSizes'
import { constrainAspectRatio } from '@/lib/aspectRatioConstraint'
import { useReportStore, selectActivePageId } from '@/store/reportStore'
import type { ReportElement, FormTableElement } from '@/types'
import { FormTableEditor } from '@/elements/formTable/FormTableEditor'

import type { ContextMenuState } from './ContextMenu'

interface Props {
  element: ReportElement
  isSelected: boolean
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
}

type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w'

const CORNER_HANDLES = new Set<ResizeHandle>(['se', 'sw', 'ne', 'nw'])

export const CanvasElement = memo(function CanvasElement({
  element,
  isSelected,
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
}: Props) {
  const removeElement = useReportStore((s) => s.removeElement)
  const updateElement = useReportStore((s) => s.updateElement)
  const activePageId = useReportStore(selectActivePageId)

  // Table edit mode state
  const [tableEditMode, setTableEditMode] = useState(false)

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
<<<<<<< HEAD
    // Disable drag while editing so pointer events reach the contenteditable
    disabled: element.locked || readonly || editing,
=======
    disabled: element.locked || readonly || tableEditMode,
>>>>>>> feat/formtable-excel-editing
  })

  // Exit table edit mode when element is deselected
  useEffect(() => {
    if (!isSelected && tableEditMode) setTableEditMode(false)
  }, [isSelected, tableEditMode])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readonly || element.locked) return
      if (element.type === 'formTable') {
        e.stopPropagation()
        e.preventDefault()
        setTableEditMode(true)
      }
    },
    [readonly, element.locked, element.type],
  )

  const handleTableChange = useCallback(
    (patch: Partial<FormTableElement>) => {
      if (activePageId) updateElement(activePageId, element.id, patch)
    },
    [activePageId, element.id, updateElement],
  )

  const handleExitTableEdit = useCallback(() => {
    setTableEditMode(false)
  }, [])

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
        // delta in px — convert to mm
        const dxMm = pxToMm(ev.clientX - resizeStart.current.mouseX)
        const dyMm = pxToMm(ev.clientY - resizeStart.current.mouseY)

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

        onResize(el.id, { width: newWidthMm, height: newHeightMm })
        if (handle.includes('w') || handle.includes('n')) {
          onMove(el.id, { x: newXMm, y: newYMm })
        }
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        resizeCleanupRef.current = null
      }

      const onPointerUp = () => {
        setResizing(null)
        resizeStart.current = null
        cleanup()
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)

      resizeCleanupRef.current = cleanup
    },
    // element is intentionally excluded — read from elementRef.current inside the handler
    [onMove, onResize, readonly],
  )

  // Convert mm → px for rendering
  const xPx = mmToPx(element.position.x) + (transform?.x ?? 0)
  const yPx = mmToPx(element.position.y) + (transform?.y ?? 0)
  const widthPx = mmToPx(element.size.width)
  const heightPx = mmToPx(element.size.height)

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
<<<<<<< HEAD
      onDoubleClick={(e) => {
        e.stopPropagation()
        enterEditMode()
      }}
=======
      onDoubleClick={handleDoubleClick}
>>>>>>> feat/formtable-excel-editing
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
      {...(!readonly && !element.locked && !editing ? { ...listeners, ...attributes } : {})}
      role={editing ? 'textbox' : 'button'}
      tabIndex={readonly ? -1 : 0}
      aria-label={element.name ? `${element.name} (${element.type})` : element.type}
      aria-pressed={editing ? undefined : isSelected}
    >
      <ElementErrorBoundary elementId={element.id} elementType={element.type} onDelete={handleDeleteElement}>
<<<<<<< HEAD
        {editing && element.type === 'text' ? (
          <TextInlineEditor
            element={element}
            onCommit={handleInlineCommit}
            onCancel={handleInlineCancel}
          />
        ) : (
          <ElementRenderer element={element} data={data} readonly={readonly} pageIndex={pageIndex} totalPages={totalPages} computedValues={computedValues} defaultTextStyle={defaultTextStyle} />
=======
        {tableEditMode && element.type === 'formTable' ? (
          <FormTableEditor
            element={element as FormTableElement}
            onChange={handleTableChange}
            onExitEditMode={handleExitTableEdit}
          />
        ) : (
          <ElementRenderer element={element} data={data} />
>>>>>>> feat/formtable-excel-editing
        )}
      </ElementErrorBoundary>

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
