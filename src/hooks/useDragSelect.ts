import { useCallback, useRef, useState } from 'react'
import { mmToPx } from '@/lib/paperSizes'
import type { Section } from '@/types'

export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

interface Options {
  sections: Section[]
  zoom: number
  readonly: boolean
  onSelectIds: (ids: string[]) => void
  currentSelectedIds?: string[]
}

/**
 * Rubber-band (marquee) selection hook for the canvas.
 *
 * Usage:
 *   const { marquee, onPointerDown, onPointerMove, onPointerUp, consumeClickIfDragSelected }
 *     = useDragSelect({ sections, zoom, readonly, onSelectIds })
 *
 * Apply onPointerDown/Move/Up to the canvas paper div.
 * In the onClick handler, call consumeClickIfDragSelected() and skip clearSelection if it returns true.
 * Render <MarqueeOverlay rect={marquee} /> inside the paper div.
 */
export function useDragSelect({ sections, zoom, readonly, onSelectIds, currentSelectedIds = [] }: Options) {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)

  // Refs to avoid stale closure issues in pointer callbacks
  const startRef = useRef<{ x: number; y: number; shiftKey: boolean; selectedIds: string[] } | null>(null)
  const marqueeRef = useRef<MarqueeRect | null>(null)
  // Cached container rect from onPointerDown — container doesn't move during drag (#126)
  const containerRectRef = useRef<DOMRect | null>(null)
  // Set to true when a drag-select just completed, to suppress the subsequent click
  const didDragSelectRef = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (readonly || e.button !== 0) return
    // Only trigger when clicking the canvas background or section divs — not on canvas elements.
    // CanvasElement roots have data-canvas-element="true"; any ancestor with that attribute
    // means the pointer is on (or inside) an element, so we skip drag-select.
    const target = e.target as HTMLElement
    if (target.closest('[data-canvas-element="true"]')) return

    containerRectRef.current = e.currentTarget.getBoundingClientRect()
    const containerRect = containerRectRef.current
    startRef.current = {
      x: (e.clientX - containerRect.left) / zoom,
      y: (e.clientY - containerRect.top) / zoom,
      shiftKey: e.shiftKey,
      // Snapshot the selection at drag-start so onPointerUp always merges
      // against the state at the moment the user began the marquee.
      selectedIds: currentSelectedIds,
    }
    marqueeRef.current = null
    didDragSelectRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [readonly, zoom, currentSelectedIds])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || !containerRectRef.current) return

    const containerRect = containerRectRef.current
    const x = (e.clientX - containerRect.left) / zoom
    const y = (e.clientY - containerRect.top) / zoom

    const dx = x - startRef.current.x
    const dy = y - startRef.current.y

    // Don't draw marquee for tiny moves (avoids flash on simple clicks)
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return

    const next: MarqueeRect = {
      x: Math.min(startRef.current.x, x),
      y: Math.min(startRef.current.y, y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    }
    marqueeRef.current = next
    setMarquee(next)
  }, [zoom])

  const onPointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    const m = marqueeRef.current
    // Capture start state before nulling startRef
    const additive = startRef.current?.shiftKey ?? false
    // Use the selection snapshot from drag-start so we merge against a consistent baseline
    const startSelectedIds = startRef.current?.selectedIds ?? []
    startRef.current = null
    marqueeRef.current = null
    setMarquee(null)

    if (!m || m.width < 4 || m.height < 4) return

    // Find all elements whose bounding box intersects the marquee rect.
    // Element positions are relative to their section; sections stack vertically.
    const toSelect: string[] = []
    let sectionOffsetY = 0

    for (const section of sections) {
      for (const el of section.elements) {
        const elX = mmToPx(el.position.x)
        const elY = sectionOffsetY + mmToPx(el.position.y)
        const elW = mmToPx(el.size.width)
        const elH = mmToPx(el.size.height)

        const intersects =
          elX < m.x + m.width &&
          elX + elW > m.x &&
          elY < m.y + m.height &&
          elY + elH > m.y

        if (intersects) toSelect.push(el.id)
      }
      sectionOffsetY += mmToPx(section.height)
    }

    if (toSelect.length > 0) {
      const finalIds = additive
        ? Array.from(new Set([...startSelectedIds, ...toSelect]))
        : toSelect
      onSelectIds(finalIds)
      didDragSelectRef.current = true
    }
  // currentSelectedIds is intentionally excluded: the snapshot is taken at drag-start
  // and stored in startRef.current.selectedIds to avoid stale-closure issues.
  }, [sections, onSelectIds])

  /**
   * Call this at the start of the canvas onClick handler.
   * Returns true if a drag-select just completed (caller should skip clearSelection).
   */
  const consumeClickIfDragSelected = useCallback(() => {
    if (didDragSelectRef.current) {
      didDragSelectRef.current = false
      return true
    }
    return false
  }, [])

  return { marquee, onPointerDown, onPointerMove, onPointerUp, consumeClickIfDragSelected }
}
