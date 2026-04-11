import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { PanelTop } from 'lucide-react'
import { useDragSelect } from '@/hooks/useDragSelect'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { useShallow } from 'zustand/shallow'
import { useReportStore, selectActivePage, flattenPageElements } from '@/store/reportStore'
import { SectionContainer } from './SectionContainer'
import { ContextMenu, type ContextMenuState } from './ContextMenu'
import { mmToPx, pxToMm } from '@/lib/paperSizes'
import type { PageDef } from '@/types'
import { PALETTE_ITEM_MAP } from '@/components/sidebar/ElementPalette'
import { RULER_SIZE, CANVAS_PADDING } from '@/config/constants'

interface Props {
  readonly?: boolean
  pageOverride?: PageDef
  dataOverride?: Record<string, unknown>
  canvasRef?: React.RefObject<HTMLDivElement | null>
}

const EMPTY_DATA: Record<string, unknown> = {}

// Trim mark dimensions (in mm, scaled by zoom at render time)
const TRIM_GAP_MM = 3    // gap between paper edge and mark
const TRIM_LENGTH_MM = 5 // length of each mark line

export function ReportCanvas({
  readonly = false,
  pageOverride,
  dataOverride,
  canvasRef,
}: Props) {
  const activePage = useReportStore(selectActivePage)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))
  const dataSource = useReportStore((s) => s.definition.dataSources[0] ?? null)
  const selectElement = useReportStore((s) => s.selectElement)
  const clearSelection = useReportStore((s) => s.clearSelection)
  const setSelectionIds = useReportStore((s) => s.setSelectionIds)
  const moveElement = useReportStore((s) => s.moveElement)
  const resizeElement = useReportStore((s) => s.resizeElement)
  const updateElement = useReportStore((s) => s.updateElement)
  const removeElement = useReportStore((s) => s.removeElement)
  const removeElements = useReportStore((s) => s.removeElements)
  const duplicateElement = useReportStore((s) => s.duplicateElement)
  const copyElements = useReportStore((s) => s.copyElements)
  const cutElements = useReportStore((s) => s.cutElements)
  const pasteElements = useReportStore((s) => s.pasteElements)
  const setZOrder = useReportStore((s) => s.setZOrder)
  const clipboard = useReportStore((s) => s.clipboard)
  const addElement = useReportStore((s) => s.addElement)
  const groupSelectedElements = useReportStore((s) => s.groupSelectedElements)
  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const zoom = useReportStore((s) => readonly ? s.previewZoom : s.editorZoom)
  const showGrid = useReportStore((s) => s.showGrid)
  const showTrimMarks = useReportStore((s) => s.showTrimMarks)
  const showMarginGuide = useReportStore((s) => s.showMarginGuide)
  const margins = useReportStore((s) => s.definition.pageSettings.margins)
  const snapToGrid = useReportStore((s) => s.snapToGrid)
  const gridSize = useReportStore((s) => s.gridSize)
  const headerEditMode = useReportStore((s) => s.headerEditMode)
  const setHeaderEditMode = useReportStore((s) => s.setHeaderEditMode)
  const updateSectionHeight = useReportStore((s) => s.updateSectionHeight)

  const page = pageOverride ?? activePage
  const data = dataOverride ?? (dataSource?.fields as Record<string, unknown> | undefined) ?? EMPTY_DATA
  const totalPages = pages.length
  const pageIndex = page ? pages.findIndex((p) => p.id === page.id) + 1 : 1

  const internalRef = useRef<HTMLDivElement>(null)
  const ref = canvasRef ?? internalRef

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragSelectIds = useCallback((ids: string[]) => {
    setSelectionIds(ids)
  }, [setSelectionIds])

  const {
    marquee,
    onPointerDown: onMarqueePointerDown,
    onPointerMove: onMarqueePointerMove,
    onPointerUp: onMarqueePointerUp,
    consumeClickIfDragSelected,
  } = useDragSelect({
    sections: page?.sections ?? [],
    zoom,
    readonly,
    onSelectIds: handleDragSelectIds,
  })

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ⌘G / Ctrl+G — group selected elements (skip when a text input has focus)
  useEffect(() => {
    if (readonly) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        if (activePage) groupSelectedElements(activePage.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [readonly, activePage, groupSelectedElements])

  // Delete / Backspace — remove selected elements (skip when a text input has focus)
  useEffect(() => {
    if (readonly) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      // Use batch removeElements to create a single undo state for multi-element deletes.
      // Also guard activePage before calling preventDefault to avoid suppressing
      // browser back-navigation (Backspace) when no page is loaded.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && activePage) {
        e.preventDefault()
        removeElements(activePage.id, selectedIds)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [readonly, activePage, selectedIds, removeElements])

  const snap = useCallback(
    (v: number) => snapToGrid ? Math.round(v / gridSize) * gridSize : v,
    [snapToGrid, gridSize],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!page || !event.delta) return
      const el = flattenPageElements(page).find((e) => e.id === event.active.id)
      if (!el) return
      const newX = el.position.x + pxToMm(event.delta.x / zoom)
      const newY = el.position.y + pxToMm(event.delta.y / zoom)
      moveElement(page.id, el.id, { x: snap(newX), y: snap(newY) })
    },
    [page, moveElement, zoom, snap],
  )

  const handleResize = useCallback(
    (elementId: string, size: { width: number; height: number }) => {
      if (!page) return
      resizeElement(page.id, elementId, size)
    },
    [page, resizeElement],
  )

  const handleMove = useCallback(
    (elementId: string, position: { x: number; y: number }) => {
      if (!page) return
      moveElement(page.id, elementId, { x: snap(position.x), y: snap(position.y) })
    },
    [page, moveElement, snap],
  )

  const handleResizeSection = useCallback(
    (sectionId: string, newHeightMm: number) => {
      if (!page) return
      updateSectionHeight(page.id, sectionId, newHeightMm)
    },
    [page, updateSectionHeight],
  )

  const handlePaletteDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer.types.includes('application/rds-palette')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    },
    [],
  )

  const handlePaletteDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const label = e.dataTransfer.getData('application/rds-palette')
      if (!label || !page) return
      const createElement = PALETTE_ITEM_MAP[label]
      if (!createElement) return
      e.preventDefault()

      // The drop target is the canvas div (ref). Calculate position relative to it.
      const canvasEl = ref.current
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()

      // rect is already scaled by zoom (CSS transform: scale), so divide by zoom
      // to get the position in unscaled canvas pixel space, then convert px → mm.
      const xMm = pxToMm((e.clientX - rect.left) / zoom)
      const yMm = pxToMm((e.clientY - rect.top) / zoom)

      // Determine which section the drop landed in based on Y coordinate
      let sectionId: string | undefined
      let sectionOffsetY = 0
      for (const sec of page.sections) {
        if (yMm < sectionOffsetY + sec.height) {
          sectionId = sec.id
          break
        }
        sectionOffsetY += sec.height
      }
      // Position relative to the target section
      const relativeY = yMm - sectionOffsetY

      // Clamp within section bounds
      const targetSection = page.sections.find((s) => s.id === sectionId)
      const sectionH = targetSection?.height ?? page.height
      const clampedX = Math.max(0, Math.min(xMm, page.width))
      const clampedY = Math.max(0, Math.min(relativeY, sectionH))

      // Apply snap-to-grid
      const finalX = snap(clampedX)
      const finalY = snap(clampedY)

      const el = createElement()

      // Offset position if it overlaps existing elements in the same section (#188)
      const sectionElements = (targetSection?.elements ?? [])
      let posX = finalX
      let posY = finalY
      const OFFSET_STEP = 5 // 5mm per step
      let offset = 0
      while (sectionElements.some((ex) =>
        ex.position.x < posX + el.size.width &&
        ex.position.x + ex.size.width > posX &&
        ex.position.y < posY + el.size.height &&
        ex.position.y + ex.size.height > posY,
      )) {
        offset += OFFSET_STEP
        posX = Math.min(finalX + offset, page.width - el.size.width)
        posY = Math.min(finalY + offset, sectionH - el.size.height)
      }

      addElement(page.id, { ...el, position: { x: posX, y: posY } }, sectionId)
    },
    [page, zoom, snap, addElement, ref],
  )

  const handleContextMenuClose = useCallback(() => setContextMenu(null), [])

  const ctxEl = contextMenu && page
    ? flattenPageElements(page).find((e) => e.id === contextMenu.elementId) ?? null
    : null

  if (!page) return null

  const canvasWidthPx = mmToPx(page.width)
  const canvasHeightPx = mmToPx(page.height)

  // Ruler ticks (every 10mm)
  const hTicks: number[] = []
  for (let mm = 0; mm <= page.width; mm += 10) hTicks.push(mm)
  const vTicks: number[] = []
  for (let mm = 0; mm <= page.height; mm += 10) vTicks.push(mm)

  // Grid lines
  const gridLinePxH: number[] = []
  for (let mm = 0; mm <= page.width; mm += gridSize) gridLinePxH.push(mmToPx(mm))
  const gridLinePxV: number[] = []
  for (let mm = 0; mm <= page.height; mm += gridSize) gridLinePxV.push(mmToPx(mm))

  const contextMenuEl = (
    <ContextMenu
      menu={contextMenu}
      pageId={page?.id}
      onClose={handleContextMenuClose}
      onCopy={() => page && copyElements(page.id, contextMenu ? [contextMenu.elementId] : [])}
      onCut={() => page && cutElements(page.id, contextMenu ? [contextMenu.elementId] : [])}
      onPaste={() => page && pasteElements(page.id)}
      onDuplicate={() => {
        if (page && contextMenu) duplicateElement(page.id, contextMenu.elementId)
      }}
      onDelete={() => {
        if (page && contextMenu) removeElement(page.id, contextMenu.elementId)
      }}
      onToggleLock={() => {
        if (page && ctxEl) {
          updateElement(page.id, ctxEl.id, { locked: !ctxEl.locked })
        }
      }}
      onToggleVisible={() => {
        if (page && ctxEl) {
          updateElement(page.id, ctxEl.id, { visible: !ctxEl.visible })
        }
      }}
      onZOrder={(order) => {
        if (page && contextMenu) setZOrder(page.id, contextMenu.elementId, order)
      }}
      onGroup={selectedIds.length >= 2 ? () => { if (page) groupSelectedElements(page.id) } : undefined}
      hasPaste={!!clipboard && clipboard.length > 0}
    />
  )

  const paperEl = (
    <DndContext
      sensors={sensors}
      modifiers={readonly ? [] : [restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={ref}
        style={{
          position: 'relative',
          width: canvasWidthPx,
          height: canvasHeightPx,
          background: page.background,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          flexShrink: 0,
          overflow: 'hidden',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        onClick={() => { if (!readonly && !consumeClickIfDragSelected()) clearSelection() }}
        onContextMenu={(e) => { if (!readonly) e.preventDefault() }}
        onPointerDown={onMarqueePointerDown}
        onPointerMove={onMarqueePointerMove}
        onPointerUp={onMarqueePointerUp}
        onDragOver={readonly ? undefined : handlePaletteDragOver}
        onDrop={readonly ? undefined : handlePaletteDrop}
      >
        {/* Grid overlay */}
        {showGrid && !readonly && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
          >
            {gridLinePxH.map((x) => (
              <line key={`h${x}`} x1={x} y1={0} x2={x} y2={canvasHeightPx} stroke="#e5e7eb" strokeWidth={0.5} />
            ))}
            {gridLinePxV.map((y) => (
              <line key={`v${y}`} x1={0} y1={y} x2={canvasWidthPx} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
            ))}
          </svg>
        )}
        {/* Margin guide overlay */}
        {showMarginGuide && margins && (margins.top > 0 || margins.right > 0 || margins.bottom > 0 || margins.left > 0) && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
          >
            <path
              d={`M0,0 H${canvasWidthPx} V${canvasHeightPx} H0 Z M${mmToPx(margins.left)},${mmToPx(margins.top)} V${canvasHeightPx - mmToPx(margins.bottom)} H${canvasWidthPx - mmToPx(margins.right)} V${mmToPx(margins.top)} Z`}
              fill="rgba(0,0,0,0.06)"
              fillRule="evenodd"
            />
          </svg>
        )}
        {page.sections.map((section) => (
          <SectionContainer
            key={section.id}
            section={section}
            pageId={page.id}
            selectedIds={selectedIdSet}
            onSelectElement={selectElement}
            onMoveElement={handleMove}
            onResizeElement={handleResize}
            onResizeSection={!readonly && headerEditMode && section.sectionType !== 'body' ? handleResizeSection : undefined}
            onContextMenu={setContextMenu}
            data={data}
            readonly={readonly}
            zoom={zoom}
            pageIndex={pageIndex}
            totalPages={totalPages}
          />
        ))}

        {/* Marquee selection rectangle */}
        {marquee && (
          <div
            style={{
              position: 'absolute',
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
              border: '1px solid hsl(var(--primary))',
              backgroundColor: 'hsl(var(--primary) / 0.08)',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          />
        )}
      </div>
    </DndContext>
  )

  // Full layout: sticky rulers + trim marks (used for both editor and readonly/preview)
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      {/* Sticky header row: corner square + horizontal ruler */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          pointerEvents: 'none',
        }}
      >
        {/* Corner square */}
        <div
          style={{
            width: RULER_SIZE,
            height: RULER_SIZE,
            flexShrink: 0,
            background: '#f8f9fa',
            borderRight: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
          }}
        />
        {/* Horizontal ruler — ticks offset by CANVAS_PADDING to align with paper */}
        <div
          style={{
            height: RULER_SIZE,
            overflow: 'hidden',
            background: '#f8f9fa',
            borderBottom: '1px solid #e5e7eb',
            userSelect: 'none',
            flex: 1,
          }}
        >
          <svg
            width={CANVAS_PADDING + canvasWidthPx * zoom + CANVAS_PADDING}
            height={RULER_SIZE}
            style={{ display: 'block' }}
          >
            {hTicks.map((mm) => {
              const x = CANVAS_PADDING + mmToPx(mm) * zoom
              const isMajor = mm % 50 === 0
              return (
                <g key={mm}>
                  <line x1={x} y1={isMajor ? 4 : 10} x2={x} y2={RULER_SIZE} stroke="#9ca3af" strokeWidth={0.5} />
                  {isMajor && <text x={x + 2} y={10} fontSize={8} fill="#6b7280">{mm}</text>}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* H/F edit mode banner — sticky below ruler */}
      {!readonly && headerEditMode && (
        <div
          style={{
            position: 'sticky',
            top: RULER_SIZE,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 12px',
            background: '#fffbeb',
            borderBottom: '1px solid #fcd34d',
            color: '#92400e',
            fontSize: '12px',
          }}
          role="status"
          aria-live="polite"
        >
          <PanelTop style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>ヘッダー/フッター 編集モード — セクション下端をドラッグして高さを変更できます</span>
          <button
            onClick={() => setHeaderEditMode(false)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              border: '1px solid #fcd34d',
              borderRadius: '4px',
              background: 'white',
              color: '#92400e',
              cursor: 'pointer',
            }}
            aria-label="ヘッダー/フッター編集モードを終了"
          >
            編集を終了
          </button>
        </div>
      )}

      {/* Content row: sticky left ruler + paper */}
      <div style={{ display: 'flex' }}>
        {/* Vertical ruler — sticky left, ticks offset by CANVAS_PADDING */}
        <div
          style={{
            position: 'sticky',
            left: 0,
            zIndex: 9,
            width: RULER_SIZE,
            flexShrink: 0,
            background: '#f8f9fa',
            borderRight: '1px solid #e5e7eb',
            overflow: 'hidden',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <svg
            width={RULER_SIZE}
            height={CANVAS_PADDING + canvasHeightPx * zoom + CANVAS_PADDING}
            style={{ display: 'block' }}
          >
            {vTicks.map((mm) => {
              const y = CANVAS_PADDING + mmToPx(mm) * zoom
              const isMajor = mm % 50 === 0
              return (
                <g key={mm}>
                  <line x1={isMajor ? 4 : 10} y1={y} x2={RULER_SIZE} y2={y} stroke="#9ca3af" strokeWidth={0.5} />
                  {isMajor && mm > 0 && (
                    <text
                      x={RULER_SIZE / 2}
                      y={y - 2}
                      fontSize={8}
                      fill="#6b7280"
                      textAnchor="middle"
                      transform={`rotate(-90, ${RULER_SIZE / 2}, ${y - 2})`}
                    >{mm}</text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Paper area with padding */}
        <div style={{ padding: CANVAS_PADDING }}>
          {/* Trim marks — rendered outside the paper, inside the padding zone */}
          <div style={{ position: 'relative' }}>
            {showTrimMarks && (() => {
              const gapPx = mmToPx(TRIM_GAP_MM) * zoom
              const markPx = mmToPx(TRIM_LENGTH_MM) * zoom
              const offset = gapPx + markPx
              const pw = canvasWidthPx * zoom
              const ph = canvasHeightPx * zoom
              const stroke = '#333'
              const sw = 0.75
              // Each corner: one horizontal line + one vertical line
              const corners = [
                // top-left
                [{ x1: 0, y1: offset, x2: markPx, y2: offset },          // H
                 { x1: offset, y1: 0, x2: offset, y2: markPx }],          // V
                // top-right
                [{ x1: offset + pw + gapPx, y1: offset, x2: offset + pw + gapPx + markPx, y2: offset },
                 { x1: offset + pw, y1: 0, x2: offset + pw, y2: markPx }],
                // bottom-left
                [{ x1: 0, y1: offset + ph, x2: markPx, y2: offset + ph },
                 { x1: offset, y1: offset + ph + gapPx, x2: offset, y2: offset + ph + gapPx + markPx }],
                // bottom-right
                [{ x1: offset + pw + gapPx, y1: offset + ph, x2: offset + pw + gapPx + markPx, y2: offset + ph },
                 { x1: offset + pw, y1: offset + ph + gapPx, x2: offset + pw, y2: offset + ph + gapPx + markPx }],
              ]
              return (
                <svg
                  style={{
                    position: 'absolute',
                    top: -offset,
                    left: -offset,
                    pointerEvents: 'none',
                    zIndex: 5,
                    overflow: 'visible',
                  }}
                  width={2 * offset + pw}
                  height={2 * offset + ph}
                >
                  {corners.map((lines, ci) =>
                    lines.map((l, li) => (
                      <line key={`${ci}-${li}`} {...l} stroke={stroke} strokeWidth={sw} />
                    ))
                  )}
                </svg>
              )
            })()}
            {paperEl}
          </div>
          {contextMenuEl}
        </div>
      </div>
    </div>
  )
}
