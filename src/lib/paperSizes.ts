import type { ParseKeys } from 'i18next'
import type { PaperSize } from '@/types'

/**
 * Paper dimensions in mm (portrait orientation). Display labels are i18n keys
 * (`components` namespace, #410) resolved with `t()` by the selector UI.
 */
export const PAPER_SIZES: Record<PaperSize, { width: number; height: number; labelKey: ParseKeys<'components'> }> = {
  // ISO A 系列
  A3:       { width: 297,   height: 420,   labelKey: 'paperSizes.a3' },
  A4:       { width: 210,   height: 297,   labelKey: 'paperSizes.a4' },
  A5:       { width: 148,   height: 210,   labelKey: 'paperSizes.a5' },
  A6:       { width: 105,   height: 148,   labelKey: 'paperSizes.a6' },
  // ISO B 系列
  B4:       { width: 250,   height: 353,   labelKey: 'paperSizes.b4' },
  B5:       { width: 176,   height: 250,   labelKey: 'paperSizes.b5' },
  // JIS B 系列（日本固有 — ISO B より大きい）
  'JIS-B4': { width: 257,   height: 364,   labelKey: 'paperSizes.jisB4' },
  'JIS-B5': { width: 182,   height: 257,   labelKey: 'paperSizes.jisB5' },
  // 北米
  Letter:   { width: 215.9, height: 279.4, labelKey: 'paperSizes.letter' },
  Legal:    { width: 215.9, height: 355.6, labelKey: 'paperSizes.legal' },
  Tabloid:  { width: 279.4, height: 431.8, labelKey: 'paperSizes.tabloid' },
  // 日本固有
  Hagaki:   { width: 100,   height: 148,   labelKey: 'paperSizes.hagaki' },
  // カスタム
  custom:   { width: 210,   height: 297,   labelKey: 'paperSizes.custom' },
}

/** Display order for the paper size selector (grouped logically). */
export const PAPER_SIZE_ORDER: PaperSize[] = [
  'A3', 'A4', 'A5', 'A6',
  'B4', 'B5',
  'JIS-B4', 'JIS-B5',
  'Letter', 'Legal', 'Tabloid',
  'Hagaki',
  'custom',
]

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

/**
 * Paper-size-specific margin presets (in mm).
 *
 * Values are based on:
 * - JIS X 4051 / ISO 216 standard document margins
 * - Microsoft Word / Google Docs defaults per paper size
 * - Typical laser/inkjet printer minimum printable area (~3-5mm)
 * - Japanese business document conventions
 * - Japanese postcard (hagaki) postal standards
 */
export const MARGIN_PRESETS: Record<PaperSize, { standard: number; narrow: number; minimum: number }> = {
  A3:       { standard: 25, narrow: 15, minimum: 6 },
  A4:       { standard: 20, narrow: 13, minimum: 5 },
  A5:       { standard: 15, narrow: 10, minimum: 5 },
  A6:       { standard: 10, narrow:  7, minimum: 3 },
  B4:       { standard: 25, narrow: 15, minimum: 6 },
  B5:       { standard: 18, narrow: 10, minimum: 5 },
  'JIS-B4': { standard: 25, narrow: 15, minimum: 6 },
  'JIS-B5': { standard: 20, narrow: 10, minimum: 5 },
  Letter:   { standard: 25, narrow: 13, minimum: 6 },
  Legal:    { standard: 25, narrow: 13, minimum: 6 },
  Tabloid:  { standard: 25, narrow: 15, minimum: 6 },
  Hagaki:   { standard:  8, narrow:  5, minimum: 3 },
  custom:   { standard: 20, narrow: 13, minimum: 5 },
}

/** Get margin presets for a paper size. Returns { standard, narrow, minimum } in mm. */
export function getMarginPresets(paperSize: PaperSize): { standard: number; narrow: number; minimum: number } {
  return MARGIN_PRESETS[paperSize]
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
    : { width: base.width, height: base.height }
}
