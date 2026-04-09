import type { PaperSize } from '@/types'

/** Paper dimensions in mm (portrait orientation). */
export const PAPER_SIZES: Record<PaperSize, { width: number; height: number; label: string }> = {
  // ISO A 系列
  A3:       { width: 297,   height: 420,   label: 'A3 (297×420mm)' },
  A4:       { width: 210,   height: 297,   label: 'A4 (210×297mm)' },
  A5:       { width: 148,   height: 210,   label: 'A5 (148×210mm)' },
  A6:       { width: 105,   height: 148,   label: 'A6 (105×148mm)' },
  // ISO B 系列
  B4:       { width: 250,   height: 353,   label: 'B4 (250×353mm)' },
  B5:       { width: 176,   height: 250,   label: 'B5 (176×250mm)' },
  // JIS B 系列（日本固有 — ISO B より大きい）
  'JIS-B4': { width: 257,   height: 364,   label: 'B4 (JIS 257×364mm)' },
  'JIS-B5': { width: 182,   height: 257,   label: 'B5 (JIS 182×257mm)' },
  // 北米
  Letter:   { width: 215.9, height: 279.4, label: 'Letter (8.5×11")' },
  Legal:    { width: 215.9, height: 355.6, label: 'Legal (8.5×14")' },
  Tabloid:  { width: 279.4, height: 431.8, label: 'Tabloid (11×17")' },
  // 日本固有
  Hagaki:   { width: 100,   height: 148,   label: 'はがき (100×148mm)' },
  // カスタム
  custom:   { width: 210,   height: 297,   label: 'カスタム' },
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
