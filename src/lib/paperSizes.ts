import type { PaperSize } from '@/types'

// Dimensions in mm (physical paper sizes)
export const PAPER_SIZES: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
  custom: { width: 210, height: 297 },
}

/**
 * Convert millimetres to pixels at the given DPI (default 96).
 * Formula: px = mm / 25.4 * dpi
 */
export function mmToPx(mm: number, dpi = 96): number {
  return (mm / 25.4) * dpi
}

/**
 * Convert pixels to millimetres at the given DPI (default 96).
 * Formula: mm = px / dpi * 25.4
 */
export function pxToMm(px: number, dpi = 96): number {
  return (px / dpi) * 25.4
}

export function getPageDimensions(
  paperSize: PaperSize,
  orientation: 'portrait' | 'landscape',
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number } {
  const base =
    paperSize === 'custom'
      ? { width: customWidth ?? 210, height: customHeight ?? 297 }
      : PAPER_SIZES[paperSize]

  return orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base
}
