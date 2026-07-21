import type { RepeatingBandElement, RepeatingBandField, TextStyle } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { applyFormat } from '@/lib/numberFormatter'
import { DEFAULT_CELL_FONT_SIZE_PT } from '@/elements/_blocks/constants'

// ---------------------------------------------------------------------------
// Style constants & helpers
// ---------------------------------------------------------------------------

// Font size in pt (issue #56) — consistent with formTable / repeatingList and
// TextStyle.fontSize, so client preview and server output agree. 8pt ≈ 2.8mm.
export const CELL_FONT_SIZE = `${DEFAULT_CELL_FONT_SIZE_PT}pt`
export const CELL_PADDING = '0.5mm 1mm'
export const DEFAULT_BORDER_WIDTH = 0.3
export const DEFAULT_BORDER_COLOR = '#000000'
export const DEFAULT_HEADER_BG = '#f3f4f6'
export const DEFAULT_HEADER_COLOR = '#1a1a1a'
export const DEFAULT_FOOTER_BG = '#f9fafb'
export const DEFAULT_GROUP_BG = '#e8ecef'
export const BADGE_BG = '#3b82f6'
export const EMPTY_TEXT_COLOR = '#9ca3af'
export const PLACEHOLDER_COLOR = '#6b7280'
export const MUTED_BAR_COLOR = '#d1d5db'

export const DEFAULT_GROUP_STYLE: TextStyle = {
  backgroundColor: DEFAULT_GROUP_BG,
  fontWeight: 'bold',
}

/** Resolve a border width/color with fallback chain, returning CSS shorthand or 'none' */
function bdr(width: number | undefined, color: string | undefined): string {
  const w = width ?? DEFAULT_BORDER_WIDTH
  if (w <= 0) return 'none'
  return `${w}mm solid ${color ?? DEFAULT_BORDER_COLOR}`
}

/** Outer frame border */
export function outerBorderStr(el: RepeatingBandElement): string {
  return bdr(el.borderWidth, el.borderColor)
}

/** Header bottom border (below header row) */
export function headerBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.headerBorderWidth ?? el.innerBorderWidth ?? el.borderWidth,
    el.headerBorderColor ?? el.innerBorderColor ?? el.borderColor,
  )
}

/** Data row bottom border (between data rows) */
export function dataBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.dataBorderWidth ?? el.innerBorderWidth ?? el.borderWidth,
    el.dataBorderColor ?? el.innerBorderColor ?? el.borderColor,
  )
}

/** Column divider border (vertical lines between columns) */
export function columnBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.columnBorderWidth ?? el.innerBorderWidth ?? el.borderWidth,
    el.columnBorderColor ?? el.innerBorderColor ?? el.borderColor,
  )
}

/** Footer top border (above totals row — typically heavier) */
export function footerBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.footerBorderWidth ?? el.borderWidth,
    el.footerBorderColor ?? el.borderColor,
  )
}

/** Column percentage widths from field definitions (guards against zero total) */
export function columnPercents(fields: readonly RepeatingBandField[]): string[] {
  const total = fields.reduce((s, f) => s + Math.max(0, f.width), 0)
  if (total === 0) return fields.map(() => `${100 / Math.max(1, fields.length)}%`)
  return fields.map((f) => `${(Math.max(0, f.width) / total) * 100}%`)
}

/** Base cell styles (layout only — no color/font) */
export function baseCellLayout(width: string, rightBorder?: string, wrapText?: boolean): React.CSSProperties {
  return {
    width,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    padding: CELL_PADDING,
    fontSize: CELL_FONT_SIZE,
    overflow: 'hidden',
    ...(wrapText
      ? { whiteSpace: 'normal', wordBreak: 'break-word' }
      : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
    boxSizing: 'border-box',
    borderRight: rightBorder,
  }
}

/** Apply TextStyle overrides to CSSProperties via spread */
export function withTextStyle(base: React.CSSProperties, ts?: TextStyle): React.CSSProperties {
  if (!ts) return base
  return {
    ...base,
    ...(ts.fontSize != null && { fontSize: `${ts.fontSize}pt` }),
    ...(ts.fontWeight != null && { fontWeight: ts.fontWeight }),
    ...(ts.fontStyle != null && { fontStyle: ts.fontStyle }),
    ...(ts.color != null && { color: ts.color }),
    ...(ts.backgroundColor != null && { backgroundColor: ts.backgroundColor }),
    ...(ts.textAlign != null && { textAlign: ts.textAlign }),
  }
}

/** Sort records by a field key with numeric/string auto-detection */
export function sortRecords(
  records: Record<string, unknown>[],
  sortKey: string,
  sortOrder: 'asc' | 'desc' = 'asc',
): Record<string, unknown>[] {
  return [...records].sort((a, b) => {
    const va = resolveField(a, sortKey)
    const vb = resolveField(b, sortKey)
    const numA = Number(va)
    const numB = Number(vb)
    const cmp = (!isNaN(numA) && !isNaN(numB) && va !== '' && vb !== '')
      ? numA - numB
      : String(va ?? '').localeCompare(String(vb ?? ''))
    return sortOrder === 'desc' ? -cmp : cmp
  })
}

/** Check if a resolved value is numeric (finite number or numeric string) */
function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return isFinite(v)
  if (typeof v === 'string' && v !== '') return isFinite(Number(v))
  return false
}

/** Default comma format applied to numeric values when no explicit format is set */
const AUTO_COMMA_FORMAT = { type: 'comma' as const }

/** Resolve + format a field value. Numeric values auto-format with comma separators. */
export function resolveAndFormat(record: Record<string, unknown>, field: RepeatingBandField): string {
  const raw = resolveField(record, field.key)
  if (raw === '') return raw
  if (field.format) return applyFormat(raw, field.format)
  // Auto-apply comma formatting for numeric values without explicit format
  if (isNumericValue(raw)) return applyFormat(raw, AUTO_COMMA_FORMAT)
  return raw
}

/** Resolve the effective text-align for a field, auto-detecting numeric values */
/** Resolve effective alignment: auto-right-align numeric values unless explicitly set to center */
export function effectiveAlign(field: RepeatingBandField, record: Record<string, unknown>): string {
  // Explicit center or right — always honor
  if (field.align === 'center' || field.align === 'right') return field.align
  // align is undefined or 'left' — auto-detect numeric values and right-align them
  const raw = resolveField(record, field.key)
  return isNumericValue(raw) ? 'right' : 'left'
}

/** Convert text-align value to flexbox justifyContent */
export function alignToJustify(align: string): React.CSSProperties['justifyContent'] {
  if (align === 'right') return 'flex-end'
  if (align === 'center') return 'center'
  return 'flex-start'
}

/** Format an aggregated number */
export function formatAggregate(value: number, field: RepeatingBandField): string {
  if (field.format) return applyFormat(value, field.format)
  return applyFormat(value, AUTO_COMMA_FORMAT)
}

/** Type guard for grouped element */
export function isGroupedElement(el: RepeatingBandElement): el is RepeatingBandElement & { groupBy: string } {
  return typeof el.groupBy === 'string' && el.groupBy.length > 0
}
