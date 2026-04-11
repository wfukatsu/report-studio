/**
 * Shared constants for element building blocks.
 * Centralizes magic numbers and configuration values.
 */

/** 1mm = 3.7795275591px @ 96dpi */
export const MM_TO_PX = 3.7795275591

/** Default font size in mm */
export const DEFAULT_FONT_SIZE = 3.5

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
