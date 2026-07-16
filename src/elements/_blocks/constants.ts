/**
 * Shared constants for element building blocks.
 * Centralizes magic numbers and configuration values.
 */

import { mmToPx } from '@/lib/paperSizes'

/** 1mm = 96/25.4 ≈ 3.7795275591px @ 96dpi — single source: paperSizes.mmToPx */
export const MM_TO_PX = mmToPx(1)

/** Default font size in pt */
export const DEFAULT_FONT_SIZE = 10

/** Default line height (unitless) */
export const DEFAULT_LINE_HEIGHT = 1.4

/** Available font families for Japanese report design */
export const FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'Noto Sans JP',
  'Noto Serif JP',
  'BIZ UDPGothic',
  'BIZ UDPMincho',
  'Meiryo',
  'MS Gothic',
  'MS Mincho',
  'Yu Gothic',
  'Yu Mincho',
] as const

/** Default chart color palette */
export const DEFAULT_CHART_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#a4de6c',
] as const

/** Image upload constraints */
export const UPLOAD_CONSTRAINTS = {
  /** Max file size for server upload (5 MB) */
  maxServerSize: 5 * 1024 * 1024,
  /** Max data URI size for Base64 inline (2 MB) */
  maxBase64Size: 2 * 1024 * 1024,
  /** Allowed MIME types */
  allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
} as const

/** Default border width in mm */
export const DEFAULT_BORDER_WIDTH = 0.3

/** Default furigana scale (relative to parent font size) */
export const DEFAULT_FURIGANA_SCALE = 0.5

/** Furigana position offset multiplier (em units) */
export const FURIGANA_OFFSET_MULTIPLIER = 1.2

// ---------------------------------------------------------------------------
// shrinkText binary search parameters
// ---------------------------------------------------------------------------

/** Minimum font size (pt) — shrinkText will never go below this */
export const MIN_SHRINK_FONT_SIZE_PT = 1

/** Maximum iterations for binary search */
export const SHRINK_MAX_ITERATIONS = 20

/** Convergence threshold for binary search (pt) */
export const SHRINK_CONVERGENCE_PT = 0.05

/** Pixel tolerance when comparing scrollHeight vs clientHeight */
export const OVERFLOW_TOLERANCE_PX = 1

// ---------------------------------------------------------------------------
// expandFrame parameters
// ---------------------------------------------------------------------------

/** Pixel tolerance for detecting overflow in expandFrame mode */
export const EXPAND_OVERFLOW_TOLERANCE_PX = 2

/** Extra padding (mm) added when expanding the frame */
export const EXPAND_PADDING_MM = 0.5

// ---------------------------------------------------------------------------
// Default cell / table font sizes (pt)
// ---------------------------------------------------------------------------

/** Default font size for table cells and similar compact text (pt) */
export const DEFAULT_CELL_FONT_SIZE_PT = 8
