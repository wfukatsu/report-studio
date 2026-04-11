/**
 * Pure zoom math utilities — no React dependency.
 * Extracted from zoomUtils.tsx so that files exporting only components
 * can remain lint-clean (react-refresh/only-export-components).
 */

import { mmToPx } from '@/lib/paperSizes'
import { RULER_SIZE, CANVAS_PADDING, ZOOM_MIN, ZOOM_MAX } from '@/config/constants'
import type { RefObject } from 'react'
import type { PageDef } from '@/types'

export function clampZoom(v: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
}

export function computeFitZoom(
  containerRef: RefObject<HTMLElement | null>,
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
