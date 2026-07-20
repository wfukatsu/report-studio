/**
 * SectionContainer — renders a single section (header/body/footer) of a page.
 *
 * - Displays elements via CanvasElement
 * - Shows a resize handle at the bottom (4px bar, cursor: row-resize)
 * - Uses pointer capture for smooth resize
 * - Minimum heights: 10mm for header/footer, 50mm for body
 */

import { useRef, useCallback, useMemo, memo, useState } from 'react'
import type { Section, ReportElement, LayerGroup, TextStyle } from '@/types'
import { mmToPx, pxToMm } from '@/lib/paperSizes'
import { CanvasElement } from './CanvasElement'
import type { ContextMenuState } from './ContextMenu'
import { useReportStore } from '@/store/reportStore'
import { useShallow } from 'zustand/shallow'
import { buildGroupMap, resolveVisible, resolveLocked } from '@/lib/groupUtils'

// Stable empty array to prevent ?? [] from creating new refs each render
const EMPTY_GROUPS: LayerGroup[] = []

const MIN_HEIGHT_MM: Record<string, number> = {
  header: 10,
  footer: 10,
  body: 50,
  custom: 10,
}

const SECTION_COLORS: Record<string, string> = {
  header: 'transparent',
  footer: 'transparent',
  body: 'transparent',
  custom: 'transparent',
}

const SECTION_BORDER = '1px dashed rgba(96, 165, 250, 0.45)' // light blue dotted

const SECTION_LABELS: Record<string, string> = {
  header: 'ヘッダー',
  footer: 'フッター',
  body: '',
  custom: 'カスタム',
}

interface Props {
  section: Section
  pageId: string
  selectedIds: Set<string>
  /** Element ID to highlight as a drop target (schema field/group drag-over) */
  dropHighlightId?: string | null
  onSelectElement: (id: string, multi: boolean) => void
  onMoveElement: (id: string, position: { x: number; y: number }) => void
  onResizeElement: (id: string, size: { width: number; height: number }) => void
  onContextMenu?: (state: ContextMenuState) => void
  onResizeSection?: (sectionId: string, newHeightMm: number) => void
  data?: Record<string, unknown>
  readonly?: boolean
  zoom?: number
  /** 1-based page index (for pageNumber elements) */
  pageIndex?: number
  /** Total page count (for pageNumber elements) */
  totalPages?: number
}

export const SectionContainer = memo(function SectionContainer({
  section,
  pageId,
  selectedIds,
  dropHighlightId,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  onContextMenu,
  onResizeSection,
  data = {},
  readonly = false,
  zoom = 1,
  pageIndex,
  totalPages,
}: Props) {
  const minHeightMm = MIN_HEIGHT_MM[section.sectionType] ?? 10

  // Group-based visibility/lock overrides
  const pageGroups = useReportStore((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    return page?.groups ?? EMPTY_GROUPS
  })
  const groupMap = useMemo(() => buildGroupMap(pageGroups), [pageGroups])

  // computedValues and defaultTextStyle subscribed once here (not in each ElementRenderer)
  // to avoid N individual store subscriptions firing on every evaluation API response.
  const computedValues = useReportStore(useShallow((s) => s.computedValues))
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))
  // Calculation-output keys, subscribed once here rather than in each ElementRenderer (#218).
  const calcOutputKeys = useReportStore(useShallow((s) =>
    new Set(s.definition.calculationRules.map((r) => r.key)),
  ))

  // Local resize height: updated on pointermove without writing to the store.
  // Only committed to the store on pointerup to avoid 120 writes/second at 120Hz.
  const [localHeightMm, setLocalHeightMm] = useState<number | null>(null)
  const heightMm = localHeightMm ?? section.height
  const heightPx = mmToPx(heightMm)

  const resizeStartRef = useRef<{ mouseY: number; startHeightMm: number } | null>(null)

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (readonly || !onResizeSection) return
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeStartRef.current = {
      mouseY: e.clientY,
      startHeightMm: section.height,
    }
    e.stopPropagation()
  }, [readonly, onResizeSection, section.height])

  const isFooter = section.sectionType === 'footer'

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current || !onResizeSection) return
    const deltaY = e.clientY - resizeStartRef.current.mouseY
    const deltaMm = pxToMm(deltaY / zoom)
    // Footer resizes from the top edge: dragging up (negative delta) increases height
    const newHeight = Math.max(minHeightMm, resizeStartRef.current.startHeightMm + (isFooter ? -deltaMm : deltaMm))
    // Update local state only — no store write until pointerup
    setLocalHeightMm(newHeight)
  }, [zoom, minHeightMm, isFooter])

  const handleResizePointerUp = useCallback(() => {
    // Commit the local height to the store once on release
    if (resizeStartRef.current && onResizeSection && localHeightMm !== null) {
      onResizeSection(section.id, localHeightMm)
    }
    setLocalHeightMm(null)
    resizeStartRef.current = null
  }, [onResizeSection, section.id, localHeightMm])

  const sortedElements = useMemo(
    () => [...section.elements].sort((a, b) => a.zIndex - b.zIndex),
    [section.elements],
  )

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: heightPx,
        backgroundColor: SECTION_COLORS[section.sectionType] ?? 'transparent',
        boxSizing: 'border-box',
        ...(section.sectionType === 'header' ? { border: SECTION_BORDER, borderTop: 'none' } :
            section.sectionType === 'footer' ? { border: SECTION_BORDER, borderBottom: 'none' } :
            {}),
      }}
    >
      {/* Section type label */}
      {SECTION_LABELS[section.sectionType] && !readonly && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 4,
            fontSize: '10px',
            color: 'rgba(96, 165, 250, 0.7)',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {SECTION_LABELS[section.sectionType]}
        </div>
      )}
      {/* Empty section guide text */}
      {section.elements.length === 0 && !readonly && SECTION_LABELS[section.sectionType] && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: 'rgba(96, 165, 250, 0.5)',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 999,
          }}
        >
          {SECTION_LABELS[section.sectionType]}に要素をドロップ
        </div>
      )}

      {/* Elements — group visible/locked overrides applied at render time */}
      {sortedElements.map((element: ReportElement) => {
        const effectiveVisible = resolveVisible(element, groupMap)
        const effectiveLocked = resolveLocked(element, groupMap)
        // Pass a patched element so CanvasElement sees the effective flags
        const effectiveElement = (effectiveVisible !== element.visible || effectiveLocked !== element.locked)
          ? { ...element, visible: effectiveVisible, locked: effectiveLocked }
          : element
        return (
          <CanvasElement
            key={element.id}
            element={effectiveElement}
            isSelected={selectedIds.has(element.id)}
            isDropTarget={dropHighlightId === element.id}
            onSelect={onSelectElement}
            onMove={onMoveElement}
            onResize={onResizeElement}
            onContextMenu={onContextMenu}
            data={data}
            readonly={readonly}
            pageIndex={pageIndex}
            totalPages={totalPages}
            computedValues={computedValues}
            defaultTextStyle={defaultTextStyle}
            calcOutputKeys={calcOutputKeys}
          />
        )
      })}

      {/* Resize handle: top for footer, bottom for header */}
      {!readonly && onResizeSection && (
        <div
          style={{
            position: 'absolute',
            ...(isFooter ? { top: 0 } : { bottom: 0 }),
            left: 0,
            right: 0,
            height: '4px',
            cursor: 'row-resize',
            backgroundColor: 'transparent',
            zIndex: 2000,
          }}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          title={`${section.sectionType}セクションの高さを変更`}
        />
      )}
    </div>
  )
})
