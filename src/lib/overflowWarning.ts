/**
 * Design-time overflow estimation for data-driven elements (issue #55).
 *
 * repeatingBand / repeatingList render with `overflow: hidden`, so records
 * beyond the element frame are silently clipped in the designer and in
 * client-side export. This estimates, from the bound preview data and the
 * element geometry, how many records actually fit — the designer shows a
 * warning badge when data would be lost.
 *
 * `maxItems` is an explicit designer choice, so records dropped by it do not
 * count as overflow; only records that were *meant* to show but don't fit do.
 */
import type { ReportElement, RepeatingBandElement, RepeatingListElement } from '@/types'

export interface OverflowWarning {
  /** Records that should be shown (after maxItems). */
  intended: number
  /** Records that actually fit in the frame. */
  visible: number
}

export function computeOverflowWarning(
  element: ReportElement,
  data: Record<string, unknown> | undefined,
): OverflowWarning | null {
  if (!data) return null
  if (element.type === 'repeatingBand') return bandOverflow(element, data)
  if (element.type === 'repeatingList') return listOverflow(element, data)
  return null
}

function boundRecords(dataSource: string, data: Record<string, unknown>): number {
  const records = data[dataSource]
  return Array.isArray(records) ? records.length : 0
}

function intendedCount(total: number, maxItems: number): number {
  return maxItems > 0 ? Math.min(total, maxItems) : total
}

function bandOverflow(
  el: RepeatingBandElement,
  data: Record<string, unknown>,
): OverflowWarning | null {
  const total = boundRecords(el.dataSource, data)
  if (total === 0 || el.itemHeight <= 0) return null

  const headerH = el.showHeader ? (el.headerHeight ?? el.itemHeight) : 0
  const footerH = el.showFooter && el.totals.length > 0 ? el.itemHeight : 0
  const available = el.size.height - headerH - footerH
  const fit = Math.max(0, Math.floor(available / el.itemHeight))

  const intended = intendedCount(total, el.maxItems)
  if (fit >= intended) return null
  return { intended, visible: fit }
}

function listOverflow(
  el: RepeatingListElement,
  data: Record<string, unknown>,
): OverflowWarning | null {
  const total = boundRecords(el.dataSource, data)
  if (total === 0) return null

  const gap = el.gap > 0 ? el.gap : 0
  let fit: number
  if (el.layout === 'horizontal') {
    if (el.itemWidth <= 0) return null
    fit = Math.floor((el.size.width + gap) / (el.itemWidth + gap))
  } else if (el.layout === 'grid') {
    if (el.itemHeight <= 0) return null
    const cols = Math.max(1, el.gridColumns)
    const rows = Math.floor((el.size.height + gap) / (el.itemHeight + gap))
    fit = cols * rows
  } else {
    if (el.itemHeight <= 0) return null
    fit = Math.floor((el.size.height + gap) / (el.itemHeight + gap))
  }
  fit = Math.max(0, fit)

  const intended = intendedCount(total, el.maxItems)
  if (fit >= intended) return null
  return { intended, visible: fit }
}
