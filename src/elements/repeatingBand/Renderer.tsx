import { memo, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RepeatingBandElement, RepeatingBandField, TextStyle } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { aggregateField } from '@/lib/aggregation'
import { applyFormat } from '@/lib/numberFormatter'
import { groupRecords, applyGroupedMaxItems, countGroupedRows } from '@/lib/grouping'

// ---------------------------------------------------------------------------
// Style constants & helpers
// ---------------------------------------------------------------------------

const CELL_FONT_SIZE = '2.8mm'
const CELL_PADDING = '0.5mm 1mm'
const DEFAULT_BORDER_WIDTH = 0.3
const DEFAULT_BORDER_COLOR = '#000000'
const DEFAULT_HEADER_BG = '#f3f4f6'
const DEFAULT_HEADER_COLOR = '#1a1a1a'
const DEFAULT_FOOTER_BG = '#f9fafb'
const DEFAULT_GROUP_BG = '#e8ecef'
const BADGE_BG = '#3b82f6'
const EMPTY_TEXT_COLOR = '#9ca3af'
const PLACEHOLDER_COLOR = '#6b7280'
const MUTED_BAR_COLOR = '#d1d5db'

const DEFAULT_GROUP_STYLE: TextStyle = {
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
function outerBorderStr(el: RepeatingBandElement): string {
  return bdr(el.borderWidth, el.borderColor)
}

/** Header bottom border (below header row) */
function headerBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.headerBorderWidth ?? el.innerBorderWidth ?? el.borderWidth,
    el.headerBorderColor ?? el.innerBorderColor ?? el.borderColor,
  )
}

/** Data row bottom border (between data rows) */
function dataBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.dataBorderWidth ?? el.innerBorderWidth ?? el.borderWidth,
    el.dataBorderColor ?? el.innerBorderColor ?? el.borderColor,
  )
}

/** Column divider border (vertical lines between columns) */
function columnBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.columnBorderWidth ?? el.innerBorderWidth ?? el.borderWidth,
    el.columnBorderColor ?? el.innerBorderColor ?? el.borderColor,
  )
}

/** Footer top border (above totals row — typically heavier) */
function footerBorderStr(el: RepeatingBandElement): string {
  return bdr(
    el.footerBorderWidth ?? el.borderWidth,
    el.footerBorderColor ?? el.borderColor,
  )
}

/** Column percentage widths from field definitions (guards against zero total) */
function columnPercents(fields: readonly RepeatingBandField[]): string[] {
  const total = fields.reduce((s, f) => s + Math.max(0, f.width), 0)
  if (total === 0) return fields.map(() => `${100 / Math.max(1, fields.length)}%`)
  return fields.map((f) => `${(Math.max(0, f.width) / total) * 100}%`)
}

/** Base cell styles (layout only — no color/font) */
function baseCellLayout(width: string, rightBorder?: string, wrapText?: boolean): React.CSSProperties {
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
function withTextStyle(base: React.CSSProperties, ts?: TextStyle): React.CSSProperties {
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
function sortRecords(
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
function resolveAndFormat(record: Record<string, unknown>, field: RepeatingBandField): string {
  const raw = resolveField(record, field.key)
  if (raw === '') return raw
  if (field.format) return applyFormat(raw, field.format)
  // Auto-apply comma formatting for numeric values without explicit format
  if (isNumericValue(raw)) return applyFormat(raw, AUTO_COMMA_FORMAT)
  return raw
}

/** Resolve the effective text-align for a field, auto-detecting numeric values */
/** Resolve effective alignment: auto-right-align numeric values unless explicitly set to center */
function effectiveAlign(field: RepeatingBandField, record: Record<string, unknown>): string {
  // Explicit center or right — always honor
  if (field.align === 'center' || field.align === 'right') return field.align
  // align is undefined or 'left' — auto-detect numeric values and right-align them
  const raw = resolveField(record, field.key)
  return isNumericValue(raw) ? 'right' : 'left'
}

/** Convert text-align value to flexbox justifyContent */
function alignToJustify(align: string): React.CSSProperties['justifyContent'] {
  if (align === 'right') return 'flex-end'
  if (align === 'center') return 'center'
  return 'flex-start'
}

/** Format an aggregated number */
function formatAggregate(value: number, field: RepeatingBandField): string {
  if (field.format) return applyFormat(value, field.format)
  return applyFormat(value, AUTO_COMMA_FORMAT)
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Column header row */
function HeaderRow({
  fields, colPcts, hbs, cbs, headerStyle, headerHeight,
}: {
  fields: readonly RepeatingBandField[]
  colPcts: string[]
  /** Header bottom border */
  hbs: string
  /** Column divider border */
  cbs: string
  headerStyle?: TextStyle
  headerHeight?: number
}) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, borderBottom: hbs, ...(headerHeight != null ? { height: `${headerHeight}mm` } : {}) }}>
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            ...baseCellLayout(colPcts[i], i < fields.length - 1 ? cbs : undefined),
            justifyContent: 'center',
            backgroundColor: headerStyle?.backgroundColor ?? DEFAULT_HEADER_BG,
            fontWeight: 'bold',
            color: headerStyle?.color ?? DEFAULT_HEADER_COLOR,
          }}
        >
          {f.label}
        </div>
      ))}
    </div>
  )
}

/** Data row */
function DataRow({
  record, rowIdx, fields, colPcts, dbs, cbs, oddBg, evenBg, hiddenFieldIndices, wrapText, itemHeight, ...rest
}: {
  record: Record<string, unknown>
  rowIdx: number
  fields: readonly RepeatingBandField[]
  colPcts: string[]
  /** Data row bottom border */
  dbs: string
  /** Column divider border */
  cbs: string
  oddBg?: string
  evenBg?: string
  hiddenFieldIndices?: readonly number[]
  wrapText?: boolean
  itemHeight?: number
  'data-testid'?: string
}) {
  return (
    <div data-testid={rest['data-testid']} style={{ display: 'flex', flexShrink: 0, borderBottom: dbs, backgroundColor: rowIdx % 2 === 0 ? oddBg : evenBg, ...(itemHeight != null && !wrapText ? { height: `${itemHeight}mm` } : { minHeight: itemHeight != null ? `${itemHeight}mm` : undefined }) }}>
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            ...baseCellLayout(colPcts[i], i < fields.length - 1 ? cbs : undefined, wrapText),
            justifyContent: alignToJustify(effectiveAlign(f, record)),
          }}
        >
          {hiddenFieldIndices?.includes(i) ? '' : resolveAndFormat(record, f)}
        </div>
      ))}
    </div>
  )
}

/** Footer totals row */
function FooterRow({
  fields, colPcts, cbs, fbs, records, totals, label,
}: {
  fields: readonly RepeatingBandField[]
  colPcts: string[]
  /** Column divider border */
  cbs: string
  /** Footer top border */
  fbs: string
  records: readonly Record<string, unknown>[]
  totals: readonly { fieldKey: string; formula: string; label?: string }[]
  label?: string
}) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, borderTop: fbs }}>
      {fields.map((f, i) => {
        const total = totals.find((t) => t.fieldKey === f.key)
        const value = total ? aggregateField(records as Record<string, unknown>[], f.key, total.formula as never) : null
        // Totals cells are numeric — default to right-align
        const align = f.align ?? (total ? 'right' : 'left')
        return (
          <div
            key={i}
            style={{
              ...baseCellLayout(colPcts[i], i < fields.length - 1 ? cbs : undefined),
              backgroundColor: DEFAULT_FOOTER_BG,
              fontWeight: 'bold',
              justifyContent: alignToJustify(align),
            }}
          >
            {value !== null
              ? formatAggregate(value, f)
              : (i === 0 ? <span style={{ color: PLACEHOLDER_COLOR }}>{label ?? '合計'}</span> : null)}
          </div>
        )
      })}
    </div>
  )
}

/** Empty row placeholders */
function EmptyRows({ count, itemHeight, dbs }: { count: number; itemHeight: number; dbs: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={`empty-${i}`} data-testid="empty-row-line" style={{ height: `${itemHeight}mm`, flexShrink: 0, borderBottom: dbs }} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Container wrapper
// ---------------------------------------------------------------------------

function BandContainer({
  el, bs, children,
}: {
  el: RepeatingBandElement
  bs: string
  children: React.ReactNode
}) {
  const isCompact = el.footerLayout === 'compact'
  return (
    <div style={{
      width: '100%',
      height: isCompact ? 'auto' : '100%',
      minHeight: isCompact ? undefined : '100%',
      display: 'flex',
      flexDirection: 'column',
      border: bs,
      boxSizing: 'border-box',
      fontFamily: 'sans-serif',
      overflow: 'hidden',
      position: 'relative',
      breakBefore: el.pageBreak === 'before' ? 'page' : undefined,
      breakAfter: el.pageBreak === 'after' ? 'page' : undefined,
    }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Design preview (no real data — shows faded mock rows)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Interactive column context menu for design preview
// ---------------------------------------------------------------------------

interface ColumnMenuState {
  x: number
  y: number
  colIndex: number
}

const INLINE_FORMAT_OPTIONS = [
  { value: '', label: 'なし' },
  { value: 'integer', label: '整数' },
  { value: 'comma', label: 'カンマ' },
  { value: 'currency_jpy', label: '¥通貨' },
  { value: 'percent', label: '%' },
] as const

/**
 * ColumnEditor — Floating panel for editing a selected column's properties.
 * Opened by clicking a header cell. Edit label, key, width, align, format.
 * Move, insert, and delete via action buttons at the bottom.
 */
function ColumnEditor({
  menu, fields, onFieldsChange, onClose,
}: {
  menu: ColumnMenuState
  fields: RepeatingBandField[]
  onFieldsChange: (fields: RepeatingBandField[]) => void
  onClose: () => void
}) {
  const { colIndex } = menu
  const field = fields[colIndex]
  if (!field) return null

  const canMoveLeft = colIndex > 0
  const canMoveRight = colIndex < fields.length - 1

  function update(patch: Partial<RepeatingBandField>) {
    const next = fields.map((f, i): RepeatingBandField =>
      i === colIndex ? { ...f, ...patch } : f,
    )
    onFieldsChange(next)
  }

  function swap(i: number, j: number) {
    const next = [...fields]
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    onFieldsChange(next)
  }

  // Clamp position to viewport
  const panelW = 220
  const panelH = 340
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - panelW - 8))
  const top = Math.max(8, Math.min(menu.y + 4, window.innerHeight - panelH - 8))

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div
        style={{ position: 'fixed', left, top, zIndex: 9999 }}
        className="bg-background border rounded-lg shadow-xl p-3 text-xs w-[220px] space-y-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">列 {colIndex + 1} を編集</span>
        <button className="text-muted-foreground hover:text-foreground text-sm leading-none" onClick={onClose}>✕</button>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">ヘッダーラベル</span>
        <input type="text" className="border rounded px-2 py-1 text-xs bg-background" value={field.label} onChange={(e) => update({ label: e.target.value })} autoFocus />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">フィールドキー</span>
        <input type="text" className="border rounded px-2 py-1 text-xs bg-background font-mono" value={field.key} onChange={(e) => update({ key: e.target.value })} />
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">幅 (mm)</span>
          <input type="number" min={5} step={1} className="border rounded px-2 py-1 text-xs bg-background" value={field.width} onChange={(e) => update({ width: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">揃え</span>
          <select className="border rounded px-1 py-1 text-xs bg-background" value={field.align ?? 'left'} onChange={(e) => update({ align: e.target.value as 'left' | 'center' | 'right' })}>
            <option value="left">左</option>
            <option value="center">中央</option>
            <option value="right">右</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">書式</span>
        <select
          className="border rounded px-1 py-1 text-xs bg-background"
          value={field.format?.type ?? ''}
          onChange={(e) => {
            const v = e.target.value
            update({ format: v ? { type: v } as RepeatingBandField['format'] : undefined })
          }}
        >
          {INLINE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1 pt-1 border-t">
        <button className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30" disabled={!canMoveLeft} onClick={() => swap(colIndex, colIndex - 1)} title="左に移動">←</button>
        <button className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30" disabled={!canMoveRight} onClick={() => swap(colIndex, colIndex + 1)} title="右に移動">→</button>
        <button
          className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          onClick={() => {
            const next = [...fields]
            next.splice(colIndex + 1, 0, { key: 'new_field', label: '新列', width: 20, align: 'left' })
            onFieldsChange(next)
          }}
          title="右に列を追加"
        >+</button>
        <div className="flex-1" />
        {fields.length > 1 && (
          <button className="px-2 py-1 text-destructive hover:bg-destructive/10 rounded" onClick={() => { onFieldsChange(fields.filter((_, i) => i !== colIndex)); onClose() }} title="この列を削除">削除</button>
        )}
      </div>
    </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Design preview with interactive column editing
// ---------------------------------------------------------------------------

function RepeatingBandDesignPreview({ element: el, onFieldsChange }: { element: RepeatingBandElement; onFieldsChange?: (fields: RepeatingBandField[]) => void }) {
  const obs = outerBorderStr(el)

  // Empty state — no fields defined yet
  if (el.fields.length === 0) {
    return (
      <BandContainer el={el} bs={obs}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2mm',
          color: '#94a3b8',
          fontSize: '3mm',
          textAlign: 'center',
          padding: '4mm',
        }}>
          <div style={{
            width: '8mm',
            height: '8mm',
            borderRadius: '50%',
            border: '0.5mm dashed #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '4mm',
            color: '#cbd5e1',
          }}>
            +
          </div>
          <div>スキーマフィールドをドロップして列を追加</div>
          <div style={{ fontSize: '2.5mm', color: '#cbd5e1' }}>
            または右クリックで手動追加
          </div>
        </div>
      </BandContainer>
    )
  }

  const hbs = headerBorderStr(el)
  const dbs = dataBorderStr(el)
  const cbs = columnBorderStr(el)
  const fbs = footerBorderStr(el)
  const colPcts = columnPercents(el.fields)
  const isGrouped = !!el.groupBy
  const PREVIEW_ROWS = 3

  // Column context menu state
  const [colMenu, setColMenu] = useState<ColumnMenuState | null>(null)

  // Column resize via drag on separator
  const resizeRef = useRef<{ colIndex: number; startX: number; startWidths: number[] } | null>(null)

  const handleResizeStart = useCallback((e: React.PointerEvent, colIndex: number) => {
    if (!onFieldsChange) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    resizeRef.current = {
      colIndex,
      startX: e.clientX,
      startWidths: el.fields.map((f) => f.width),
    }
  }, [el.fields, onFieldsChange])

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    const r = resizeRef.current
    if (!r || !onFieldsChange) return
    const dx = e.clientX - r.startX
    // Convert px delta to mm delta (approximate: assume container is ~page width)
    const containerWidth = (e.currentTarget as HTMLElement).closest('[style*="width: 100%"]')?.clientWidth ?? 600
    const totalMm = r.startWidths.reduce((s, w) => s + w, 0)
    const dMm = (dx / containerWidth) * totalMm

    const newWidths = [...r.startWidths]
    const leftW = Math.max(5, r.startWidths[r.colIndex] + dMm)
    const rightW = Math.max(5, r.startWidths[r.colIndex + 1] - dMm)
    newWidths[r.colIndex] = leftW
    newWidths[r.colIndex + 1] = rightW

    const newFields = el.fields.map((f, i): RepeatingBandField => ({ ...f, width: Math.round(newWidths[i] * 10) / 10 }))
    onFieldsChange(newFields)
  }, [el.fields, onFieldsChange])

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null
  }, [])

  const handleColumnContextMenu = useCallback((e: React.MouseEvent, colIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    // Use the mouse click position directly — most reliable across zoom levels
    const x = e.clientX
    const y = e.clientY
    setColMenu({ x, y, colIndex })
  }, [])

  return (
    <BandContainer el={el} bs={obs}>
      {/* Interactive header row (design mode) */}
      {el.showHeader && (
        <div
          style={{ display: 'flex', flexShrink: 0, borderBottom: hbs, ...(el.headerHeight != null ? { height: `${el.headerHeight}mm` } : {}) }}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        >
          {el.fields.map((f, i) => (
            <div
              key={i}
              style={{
                ...baseCellLayout(colPcts[i], undefined),
                justifyContent: 'center',
                backgroundColor: colMenu?.colIndex === i ? '#6366f120' : (el.headerStyle?.backgroundColor ?? DEFAULT_HEADER_BG),
                fontWeight: 'bold',
                color: el.headerStyle?.color ?? DEFAULT_HEADER_COLOR,
                borderBottom: colMenu?.colIndex === i ? '2px solid #6366f1' : 'none',
                position: 'relative',
                cursor: onFieldsChange ? 'pointer' : 'default',
                transition: 'background-color 0.1s',
              }}
              onClick={(e) => { e.stopPropagation(); handleColumnContextMenu(e, i) }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); handleColumnContextMenu(e, i) }}
              title={`${f.label} (${f.key}) — クリックで編集`}
            >
              {f.label}
              {/* Column resize handle (between columns) */}
              {onFieldsChange && i < el.fields.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    right: -2,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    cursor: 'col-resize',
                    zIndex: 20,
                  }}
                  onPointerDown={(e) => handleResizeStart(e, i)}
                />
              )}
              {/* Column separator line */}
              {i < el.fields.length - 1 && (
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, borderRight: cbs }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Column editor panel — rendered via portal to escape zoom transform */}
      {colMenu && onFieldsChange && createPortal(
        <ColumnEditor
          menu={colMenu}
          fields={el.fields}
          onFieldsChange={onFieldsChange}
          onClose={() => setColMenu(null)}
        />,
        document.body,
      )}

      {/* Info badge — positioned below header if visible */}
      <div style={{
        position: 'absolute',
        top: el.showHeader ? `${el.itemHeight}mm` : 0,
        right: 0,
        background: BADGE_BG,
        color: '#ffffff',
        fontSize: '2mm',
        padding: '0.5mm 1.5mm',
        borderBottomLeftRadius: '1mm',
        zIndex: 10,
        fontWeight: 'bold',
        letterSpacing: '0.05em',
      }}>
        繰り返しバンド · {el.dataSource}{isGrouped ? ` (${el.groupBy}でグループ化)` : ''}
      </div>

      {/* Grouped preview */}
      {isGrouped ? (
        <>
          <div style={{
            height: `${el.itemHeight}mm`,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 1mm',
            backgroundColor: el.headerStyle?.backgroundColor ?? '#e2e8f0',
            borderBottom: dbs,
            fontWeight: 'bold',
            fontSize: CELL_FONT_SIZE,
            color: el.headerStyle?.color ?? DEFAULT_HEADER_COLOR,
          }}>
            ■ グループ 1
          </div>
          {Array.from({ length: 2 }, (_, rowIdx) => (
            <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, borderBottom: dbs, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : 0.7 }}>
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? cbs : undefined), justifyContent: alignToJustify(f.align ?? 'left') }}>
                  {rowIdx === 0
                    ? <span style={{ color: PLACEHOLDER_COLOR, fontStyle: 'italic' }}>{`{{${f.key}}}`}</span>
                    : <span style={{ color: MUTED_BAR_COLOR }}>▬▬</span>}
                </div>
              ))}
            </div>
          ))}
          {el.showGroupSubtotals && (
            <div data-testid="group-subtotal-preview" style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: (el.groupStyle ?? DEFAULT_GROUP_STYLE).backgroundColor ?? DEFAULT_GROUP_BG, borderBottom: dbs }}>
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? cbs : undefined), fontWeight: 'bold', justifyContent: alignToJustify(f.align ?? 'left') }}>
                  {i === 0 ? '小計' : el.totals.find((t) => t.fieldKey === f.key) ? 'Σ' : ''}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        Array.from({ length: PREVIEW_ROWS }, (_, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, borderBottom: dbs, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : rowIdx === 1 ? 0.7 : 0.4 }}>
            {el.fields.map((f, i) => (
              <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? cbs : undefined), justifyContent: alignToJustify(f.align ?? 'left') }}>
                {rowIdx === 0
                  ? <span style={{ color: PLACEHOLDER_COLOR, fontStyle: 'italic' }}>{`{{${f.key}}}`}</span>
                  : <span style={{ color: MUTED_BAR_COLOR }}>{'▬▬▬'.slice(0, 3 - rowIdx)}</span>}
              </div>
            ))}
          </div>
        ))
      )}

      {/* Repeat indicator */}
      <div style={{
        flex: el.footerLayout === 'compact' ? '0 0 auto' : 1,
        minHeight: `${el.itemHeight}mm`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#93c5fd',
        fontSize: '2.5mm',
        background: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(219,234,254,0.3) 4px, rgba(219,234,254,0.3) 8px)',
      }}>
        ↻ {el.maxItems > 0 ? `最大 ${el.maxItems} 件` : 'レコード数分 繰り返し'}
        {el.footerLayout === 'compact' && ' (詰め)'}
      </div>

      {el.showFooter && el.totals.length > 0 && (
        <div style={{ display: 'flex', flexShrink: 0, borderTop: fbs }}>
          {el.fields.map((f, i) => {
            const total = el.totals.find((t) => t.fieldKey === f.key)
            return (
              <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? cbs : undefined), backgroundColor: DEFAULT_FOOTER_BG, fontWeight: 'bold', justifyContent: alignToJustify(f.align ?? 'left') }}>
                {total
                  ? <span>{total.label ?? total.fieldKey} ({total.formula})</span>
                  : (i === 0 ? <span style={{ color: PLACEHOLDER_COLOR }}>{el.totals[0]?.label ?? '合計'}</span> : null)}
              </div>
            )
          })}
        </div>
      )}
    </BandContainer>
  )
}

// ---------------------------------------------------------------------------
// Live renderer — flat path (no groupBy)
// ---------------------------------------------------------------------------

function FlatBandRenderer({
  el, records,
}: {
  el: RepeatingBandElement
  records: Record<string, unknown>[]
}) {
  const obs = outerBorderStr(el)
  const hbs = headerBorderStr(el)
  const dbs = dataBorderStr(el)
  const cbs = columnBorderStr(el)
  const fbs = footerBorderStr(el)
  const colPcts = columnPercents(el.fields)
  const hasFooter = el.showFooter && el.totals.length > 0
  const isFixed = el.footerLayout !== 'compact'

  const sorted = el.sortBy
    ? sortRecords(records, el.sortBy, el.sortOrder)
    : records
  const limited = el.maxItems > 0 ? sorted.slice(0, el.maxItems) : sorted

  const emptyCount = el.showEmptyRowLines && el.maxItems > 0
    ? Math.max(0, el.maxItems - limited.length)
    : 0

  return (
    <BandContainer el={el} bs={obs}>
      {el.showHeader && (
        <HeaderRow fields={el.fields} colPcts={colPcts} hbs={hbs} cbs={cbs} headerStyle={el.headerStyle} headerHeight={el.headerHeight} />
      )}

      {limited.length === 0 && !el.showEmptyRowLines ? (
        <div style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, alignItems: 'center', justifyContent: 'center', color: EMPTY_TEXT_COLOR, fontSize: CELL_FONT_SIZE }}>
          データなし
        </div>
      ) : (
        limited.map((record, rowIdx) => (
          <DataRow key={rowIdx} record={record} rowIdx={rowIdx} fields={el.fields} colPcts={colPcts} dbs={dbs} cbs={cbs} oddBg={el.oddRowColor} evenBg={el.evenRowColor} wrapText={el.wrapText} itemHeight={el.itemHeight} />
        ))
      )}

      {emptyCount > 0 && <EmptyRows count={emptyCount} itemHeight={el.itemHeight} dbs={dbs} />}

      {/* Fixed mode: spacer with column dividers pushes footer to bottom */}
      {isFixed && hasFooter && (
        <div style={{ flex: 1, display: 'flex' }}>
          {el.fields.map((f, i) => (
            <div key={i} style={{ width: colPcts[i], borderRight: i < el.fields.length - 1 ? cbs : undefined }} />
          ))}
        </div>
      )}

      {hasFooter && (
        <FooterRow fields={el.fields} colPcts={colPcts} cbs={cbs} fbs={fbs} records={limited} totals={el.totals} label={el.totals[0]?.label} />
      )}
    </BandContainer>
  )
}

// ---------------------------------------------------------------------------
// Live renderer — grouped path (groupBy set)
// ---------------------------------------------------------------------------

/** Type guard for grouped element */
function isGroupedElement(el: RepeatingBandElement): el is RepeatingBandElement & { groupBy: string } {
  return typeof el.groupBy === 'string' && el.groupBy.length > 0
}

function GroupedBandRenderer({
  el, records,
}: {
  el: RepeatingBandElement & { groupBy: string }
  records: Record<string, unknown>[]
}) {
  const obs = outerBorderStr(el)
  const hbs = headerBorderStr(el)
  const dbs = dataBorderStr(el)
  const cbs = columnBorderStr(el)
  const fbs = footerBorderStr(el)
  const colPcts = columnPercents(el.fields)
  const hasFooter = el.showFooter && el.totals.length > 0
  const hasSubtotals = !!el.showGroupSubtotals && el.totals.length > 0
  const groupStyle = el.groupStyle ?? DEFAULT_GROUP_STYLE

  const sorted = el.sortBy
    ? sortRecords(records, el.sortBy, el.sortOrder)
    : records

  let groups = groupRecords(sorted, el.groupBy)

  if (el.maxItems > 0) {
    groups = applyGroupedMaxItems(groups, el.maxItems, hasSubtotals)
  }

  const consumedRows = countGroupedRows(groups, hasSubtotals)
  const emptyCount = el.showEmptyRowLines && el.maxItems > 0
    ? Math.max(0, el.maxItems - consumedRows)
    : 0

  const allRecords = groups.flatMap((g) => g.records)

  const hiddenFieldIndices = el.fields
    .map((f, i) => f.key === el.groupBy ? i : -1)
    .filter((i) => i >= 0)

  return (
    <BandContainer el={el} bs={obs}>
      {el.showHeader && (
        <HeaderRow fields={el.fields} colPcts={colPcts} hbs={hbs} cbs={cbs} headerStyle={el.headerStyle} headerHeight={el.headerHeight} />
      )}

      {groups.map((group, gIdx) => (
        <div key={gIdx} data-testid="group-section">
          <div
            data-testid="group-header"
            style={withTextStyle({
              height: `${el.itemHeight}mm`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              padding: '0 1mm',
              backgroundColor: el.headerStyle?.backgroundColor ?? '#e2e8f0',
              borderBottom: dbs,
              fontWeight: 'bold',
              fontSize: CELL_FONT_SIZE,
              color: el.headerStyle?.color ?? DEFAULT_HEADER_COLOR,
            }, el.headerStyle)}
          >
            ■ {group.groupValue}
          </div>

          {group.records.map((record, rowIdx) => (
            <DataRow
              key={rowIdx}
              data-testid="group-data-row"
              record={record}
              rowIdx={rowIdx}
              fields={el.fields}
              colPcts={colPcts}
              dbs={dbs}
              cbs={cbs}
              oddBg={el.oddRowColor}
              evenBg={el.evenRowColor}
              hiddenFieldIndices={hiddenFieldIndices}
              wrapText={el.wrapText}
              itemHeight={el.itemHeight}
            />
          ))}

          {hasSubtotals && (
            <div
              data-testid="group-subtotal"
              style={{
                display: 'flex',
                height: `${el.itemHeight}mm`,
                flexShrink: 0,
                backgroundColor: groupStyle.backgroundColor ?? DEFAULT_GROUP_BG,
                borderBottom: dbs,
              }}
            >
              {el.fields.map((f, i) => {
                const total = el.totals.find((t) => t.fieldKey === f.key)
                const value = total ? aggregateField(group.records, f.key, total.formula) : null
                const align = f.align ?? (total ? 'right' : 'left')
                return (
                  <div
                    key={i}
                    style={{
                      ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? cbs : undefined),
                      fontWeight: groupStyle.fontWeight ?? 'bold',
                      justifyContent: alignToJustify(align),
                      color: groupStyle.color,
                    }}
                  >
                    {value !== null ? formatAggregate(value, f) : (i === 0 ? '小計' : '')}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {emptyCount > 0 && <EmptyRows count={emptyCount} itemHeight={el.itemHeight} dbs={dbs} />}

      {el.footerLayout !== 'compact' && hasFooter && (
        <div style={{ flex: 1, display: 'flex' }}>
          {el.fields.map((f, i) => (
            <div key={i} style={{ width: colPcts[i], borderRight: i < el.fields.length - 1 ? cbs : undefined }} />
          ))}
        </div>
      )}

      {hasFooter && (
        <FooterRow fields={el.fields} colPcts={colPcts} cbs={cbs} fbs={fbs} records={allRecords} totals={el.totals} label={el.totals[0]?.label} />
      )}
    </BandContainer>
  )
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

interface Props {
  element: RepeatingBandElement
  /** Live Preview 時に渡す配列データ。undefined = デザインプレビュー表示 */
  records?: Record<string, unknown>[]
  /** デザインモード時にフィールド変更を通知するコールバック */
  onFieldsChange?: (fields: RepeatingBandField[]) => void
}

export const RepeatingBandRenderer = memo(function RepeatingBandRenderer({ element, records, onFieldsChange }: Props) {
  if (records === undefined) {
    return <RepeatingBandDesignPreview element={element} onFieldsChange={onFieldsChange} />
  }
  if (isGroupedElement(element)) {
    return <GroupedBandRenderer el={element} records={records} />
  }
  return <FlatBandRenderer el={element} records={records} />
})
