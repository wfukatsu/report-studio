/**
 * Shared zoom icons and fit-zoom computation used by ZoomControl and Toolbar.
 */

import { mmToPx } from '@/lib/paperSizes'
import { RULER_SIZE, CANVAS_PADDING, ZOOM_MIN, ZOOM_MAX } from '@/config/constants'
import type { PageDef } from '@/types'

export function clampZoom(v: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
}

export function computeFitZoom(
  containerRef: React.RefObject<HTMLElement | null>,
  page: PageDef,
): { fitWidth: number; fitPage: number } {
  const el = containerRef.current
  if (!el) return { fitWidth: 1, fitPage: 1 }
  const availW = el.clientWidth - RULER_SIZE - 2 * CANVAS_PADDING
  const availH = el.clientHeight - RULER_SIZE - 2 * CANVAS_PADDING
  const paperW = mmToPx(page.width)
  const paperH = mmToPx(page.height)
  return {
    fitWidth: clampZoom(availW / paperW),
    fitPage: clampZoom(Math.min(availW / paperW, availH / paperH)),
  }
}

/** Fit-width: two vertical rails with a double-headed arrow between them. */
export function FitWidthIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1.5" y1="2" x2="1.5" y2="12" strokeWidth="1.5" />
      <line x1="12.5" y1="2" x2="12.5" y2="12" strokeWidth="1.5" />
      <line x1="1.5" y1="7" x2="12.5" y2="7" strokeWidth="1" />
      <polyline points="4,5 1.5,7 4,9" strokeWidth="1.2" />
      <polyline points="10,5 12.5,7 10,9" strokeWidth="1.2" />
    </svg>
  )
}

/** Fit-page: a page rectangle with outward L-shaped corner arrows. */
export function FitPageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" strokeWidth="1" />
      <polyline points="3.5,1.5 1.5,1.5 1.5,3.5" strokeWidth="1.2" />
      <polyline points="10.5,1.5 12.5,1.5 12.5,3.5" strokeWidth="1.2" />
      <polyline points="3.5,12.5 1.5,12.5 1.5,10.5" strokeWidth="1.2" />
      <polyline points="10.5,12.5 12.5,12.5 12.5,10.5" strokeWidth="1.2" />
    </svg>
  )
}
