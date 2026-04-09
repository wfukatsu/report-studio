/**
 * SectionContainer — renders a single section (header/body/footer) of a page.
 *
 * - Displays elements via CanvasElement
 * - Shows a resize handle at the bottom (4px bar, cursor: row-resize)
 * - Uses pointer capture for smooth resize
 * - Minimum heights: 10mm for header/footer, 50mm for body
 */

import { useRef, useCallback, useMemo, memo } from 'react'
import type { Section, ReportElement, LayerGroup } from '@/types'
import { mmToPx, pxToMm } from '@/lib/paperSizes'
import { CanvasElement } from './CanvasElement'
import type { ContextMenuState } from './ContextMenu'
import { useReportStore } from '@/store/reportStore'
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
  header: 'rgba(59, 130, 246, 0.08)',  // blue tint
  footer: 'rgba(107, 114, 128, 0.08)', // gray tint
  body: 'transparent',
  custom: 'transparent',
}

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
  onSelectElement: (id: string, multi: boolean) => void
  onMoveElement: (id: string, position: { x: number; y: number }) => void
  onResizeElement: (id: string, size: { width: number; height: number }) => void
  onContextMenu?: (state: ContextMenuState) => void
  onResizeSection?: (sectionId: string, newHeightMm: number) => void
  data?: Record<string, unknown>
  readonly?: boolean
  zoom?: number
}

export const SectionContainer = memo(function SectionContainer({
  section,
  pageId,
  selectedIds,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  onContextMenu,
  onResizeSection,
  data = {},
  readonly = false,
  zoom = 1,
}: Props) {
  const heightPx = mmToPx(section.height)
  const minHeightMm = MIN_HEIGHT_MM[section.sectionType] ?? 10

  // Group-based visibility/lock overrides
  const pageGroups = useReportStore((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    return page?.groups ?? EMPTY_GROUPS
  })
  const groupMap = useMemo(() => buildGroupMap(pageGroups), [pageGroups])

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

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current || !onResizeSection) return
    const deltaY = e.clientY - resizeStartRef.current.mouseY
    const deltaMm = pxToMm(deltaY / zoom)
    const newHeight = Math.max(minHeightMm, resizeStartRef.current.startHeightMm + deltaMm)
    onResizeSection(section.id, newHeight)
  }, [onResizeSection, section.id, zoom, minHeightMm])

  const handleResizePointerUp = useCallback(() => {
    resizeStartRef.current = null
  }, [])

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
        borderBottom: section.sectionType !== 'body' ? '1px dashed #d1d5db' : undefined,
        borderTop: section.sectionType === 'footer' ? '1px dashed #d1d5db' : undefined,
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
            color: '#6b7280',
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
            color: '#9ca3af',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 999,
          }}
        >
          要素をドロップして{SECTION_LABELS[section.sectionType]}を作成
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
            onSelect={onSelectElement}
            onMove={onMoveElement}
            onResize={onResizeElement}
            onContextMenu={onContextMenu}
            data={data}
            readonly={readonly}
          />
        )
      })}

      {/* Resize handle at bottom */}
      {!readonly && onResizeSection && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
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
