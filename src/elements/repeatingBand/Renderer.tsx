import { memo } from 'react'
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

/** Build border shorthand from element settings */
function borderStr(el: { borderWidth?: number; borderColor?: string }): string {
  return `${el.borderWidth ?? DEFAULT_BORDER_WIDTH}mm solid ${el.borderColor ?? DEFAULT_BORDER_COLOR}`
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
    ...(ts.fontSize != null && { fontSize: `${ts.fontSize}mm` }),
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

/** Resolve + format a field value */
function resolveAndFormat(record: Record<string, unknown>, field: RepeatingBandField): string {
  const raw = resolveField(record, field.key)
  if (raw === '' || !field.format) return raw
  return applyFormat(raw, field.format)
}

/** Format an aggregated number */
function formatAggregate(value: number, field: RepeatingBandField): string {
  if (field.format) return applyFormat(value, field.format)
  return value.toFixed(2).replace(/\.?0+$/, '') // remove trailing zeros: 300.00 → 300, 12.50 → 12.5
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Column header row */
function HeaderRow({
  fields, colPcts, bs, headerStyle, headerHeight,
}: {
  fields: readonly RepeatingBandField[]
  colPcts: string[]
  bs: string
  headerStyle?: TextStyle
  headerHeight?: number
}) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, borderBottom: bs, ...(headerHeight != null ? { height: `${headerHeight}mm` } : {}) }}>
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            ...baseCellLayout(colPcts[i], i < fields.length - 1 ? bs : undefined),
            justifyContent: 'center',
            backgroundColor: headerStyle?.backgroundColor ?? DEFAULT_HEADER_BG,
            fontWeight: 'bold',
            color: headerStyle?.color ?? DEFAULT_HEADER_COLOR,
            borderBottom: 'none',
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
  record, rowIdx, fields, colPcts, bs, oddBg, evenBg, hiddenFieldIndices, wrapText, itemHeight, ...rest
}: {
  record: Record<string, unknown>
  rowIdx: number
  fields: readonly RepeatingBandField[]
  colPcts: string[]
  bs: string
  oddBg?: string
  evenBg?: string
  hiddenFieldIndices?: readonly number[]
  wrapText?: boolean
  itemHeight?: number
  'data-testid'?: string
}) {
  return (
    <div data-testid={rest['data-testid']} style={{ display: 'flex', flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? oddBg : evenBg, ...(itemHeight != null && !wrapText ? { height: `${itemHeight}mm` } : { minHeight: itemHeight != null ? `${itemHeight}mm` : undefined }) }}>
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            ...baseCellLayout(colPcts[i], i < fields.length - 1 ? bs : undefined, wrapText),
            textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'],
            borderBottom: bs,
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
  fields, colPcts, bs, records, totals, label,
}: {
  fields: readonly RepeatingBandField[]
  colPcts: string[]
  bs: string
  records: readonly Record<string, unknown>[]
  totals: readonly { fieldKey: string; formula: string; label?: string }[]
  label?: string
}) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, borderTop: bs }}>
      {fields.map((f, i) => {
        const total = totals.find((t) => t.fieldKey === f.key)
        const value = total ? aggregateField(records as Record<string, unknown>[], f.key, total.formula as never) : null
        return (
          <div
            key={i}
            style={{
              ...baseCellLayout(colPcts[i], i < fields.length - 1 ? bs : undefined),
              backgroundColor: DEFAULT_FOOTER_BG,
              fontWeight: 'bold',
              textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'],
              borderBottom: 'none',
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
function EmptyRows({ count, itemHeight, bs }: { count: number; itemHeight: number; bs: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={`empty-${i}`} data-testid="empty-row-line" style={{ height: `${itemHeight}mm`, flexShrink: 0, borderBottom: bs }} />
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
  return (
    <div style={{
      width: '100%',
      height: '100%',
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

function RepeatingBandDesignPreview({ element: el }: { element: RepeatingBandElement }) {
  const bs = borderStr(el)
  const colPcts = columnPercents(el.fields)
  const isGrouped = !!el.groupBy
  const PREVIEW_ROWS = 3

  return (
    <BandContainer el={el} bs={bs}>
      {el.showHeader && (
        <HeaderRow fields={el.fields} colPcts={colPcts} bs={bs} headerStyle={el.headerStyle} headerHeight={el.headerHeight} />
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
            borderBottom: bs,
            fontWeight: 'bold',
            fontSize: CELL_FONT_SIZE,
            color: el.headerStyle?.color ?? DEFAULT_HEADER_COLOR,
          }}>
            ■ グループ 1
          </div>
          {Array.from({ length: 2 }, (_, rowIdx) => (
            <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : 0.7 }}>
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? bs : undefined), textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'], borderBottom: bs }}>
                  {rowIdx === 0
                    ? <span style={{ color: PLACEHOLDER_COLOR, fontStyle: 'italic' }}>{`{{${f.key}}}`}</span>
                    : <span style={{ color: MUTED_BAR_COLOR }}>▬▬</span>}
                </div>
              ))}
            </div>
          ))}
          {el.showGroupSubtotals && (
            <div data-testid="group-subtotal-preview" style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: (el.groupStyle ?? DEFAULT_GROUP_STYLE).backgroundColor ?? DEFAULT_GROUP_BG, borderBottom: bs }}>
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? bs : undefined), fontWeight: 'bold', textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'], borderBottom: 'none' }}>
                  {i === 0 ? '小計' : el.totals.find((t) => t.fieldKey === f.key) ? 'Σ' : ''}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        Array.from({ length: PREVIEW_ROWS }, (_, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : rowIdx === 1 ? 0.7 : 0.4 }}>
            {el.fields.map((f, i) => (
              <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? bs : undefined), textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'], borderBottom: bs }}>
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
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#93c5fd',
        fontSize: '2.5mm',
        borderBottom: el.showFooter ? bs : 'none',
        background: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(219,234,254,0.3) 4px, rgba(219,234,254,0.3) 8px)',
      }}>
        ↻ {el.maxItems > 0 ? `最大 ${el.maxItems} 件` : 'レコード数分 繰り返し'}
      </div>

      {el.showFooter && el.totals.length > 0 && (
        <div style={{ display: 'flex', flexShrink: 0, borderTop: bs }}>
          {el.fields.map((f, i) => {
            const total = el.totals.find((t) => t.fieldKey === f.key)
            return (
              <div key={i} style={{ ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? bs : undefined), backgroundColor: DEFAULT_FOOTER_BG, fontWeight: 'bold', textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'], borderBottom: 'none' }}>
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
  const bs = borderStr(el)
  const colPcts = columnPercents(el.fields)
  const hasFooter = el.showFooter && el.totals.length > 0

  // Sort first, then apply maxItems (so top-N items are selected after sort)
  const sorted = el.sortBy
    ? sortRecords(records, el.sortBy, el.sortOrder)
    : records
  const limited = el.maxItems > 0 ? sorted.slice(0, el.maxItems) : sorted

  const emptyCount = el.showEmptyRowLines && el.maxItems > 0
    ? Math.max(0, el.maxItems - limited.length)
    : 0

  return (
    <BandContainer el={el} bs={bs}>
      {el.showHeader && (
        <HeaderRow fields={el.fields} colPcts={colPcts} bs={bs} headerStyle={el.headerStyle} headerHeight={el.headerHeight} />
      )}

      {limited.length === 0 && !el.showEmptyRowLines ? (
        <div style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, alignItems: 'center', justifyContent: 'center', color: EMPTY_TEXT_COLOR, fontSize: CELL_FONT_SIZE, borderBottom: hasFooter ? bs : undefined }}>
          データなし
        </div>
      ) : (
        limited.map((record, rowIdx) => (
          <DataRow key={rowIdx} record={record} rowIdx={rowIdx} fields={el.fields} colPcts={colPcts} bs={bs} oddBg={el.oddRowColor} evenBg={el.evenRowColor} wrapText={el.wrapText} itemHeight={el.itemHeight} />
        ))
      )}

      {emptyCount > 0 && <EmptyRows count={emptyCount} itemHeight={el.itemHeight} bs={bs} />}

      {hasFooter && (
        <FooterRow fields={el.fields} colPcts={colPcts} bs={bs} records={limited} totals={el.totals} label={el.totals[0]?.label} />
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
  const bs = borderStr(el)
  const colPcts = columnPercents(el.fields)
  const hasFooter = el.showFooter && el.totals.length > 0
  const hasSubtotals = !!el.showGroupSubtotals && el.totals.length > 0
  const groupStyle = el.groupStyle ?? DEFAULT_GROUP_STYLE

  // 1. Sort all records first (so top-N items are selected after sort)
  const sorted = el.sortBy
    ? sortRecords(records, el.sortBy, el.sortOrder)
    : records

  // 2. Group sorted records
  let groups = groupRecords(sorted, el.groupBy)

  // 3. Apply maxItems (after grouping, so groups get fair representation)
  if (el.maxItems > 0) {
    groups = applyGroupedMaxItems(groups, el.maxItems, hasSubtotals)
  }

  // 4. Compute empty rows
  const consumedRows = countGroupedRows(groups, hasSubtotals)
  const emptyCount = el.showEmptyRowLines && el.maxItems > 0
    ? Math.max(0, el.maxItems - consumedRows)
    : 0

  // 5. All records for grand total
  const allRecords = groups.flatMap((g) => g.records)

  // Auto-hide groupBy field in data cells
  const hiddenFieldIndices = el.fields
    .map((f, i) => f.key === el.groupBy ? i : -1)
    .filter((i) => i >= 0)

  return (
    <BandContainer el={el} bs={bs}>
      {el.showHeader && (
        <HeaderRow fields={el.fields} colPcts={colPcts} bs={bs} headerStyle={el.headerStyle} headerHeight={el.headerHeight} />
      )}

      {groups.map((group, gIdx) => (
        <div key={gIdx} data-testid="group-section">
          {/* Group header */}
          <div
            data-testid="group-header"
            style={withTextStyle({
              height: `${el.itemHeight}mm`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              padding: '0 1mm',
              backgroundColor: el.headerStyle?.backgroundColor ?? '#e2e8f0',
              borderBottom: bs,
              fontWeight: 'bold',
              fontSize: CELL_FONT_SIZE,
              color: el.headerStyle?.color ?? DEFAULT_HEADER_COLOR,
            }, el.headerStyle)}
          >
            ■ {group.groupValue}
          </div>

          {/* Data rows */}
          {group.records.map((record, rowIdx) => (
            <DataRow
              key={rowIdx}
              data-testid="group-data-row"
              record={record}
              rowIdx={rowIdx}
              fields={el.fields}
              colPcts={colPcts}
              bs={bs}
              oddBg={el.oddRowColor}
              evenBg={el.evenRowColor}
              hiddenFieldIndices={hiddenFieldIndices}
              wrapText={el.wrapText}
              itemHeight={el.itemHeight}
            />
          ))}

          {/* Group subtotal */}
          {hasSubtotals && (
            <div
              data-testid="group-subtotal"
              style={{
                display: 'flex',
                height: `${el.itemHeight}mm`,
                flexShrink: 0,
                backgroundColor: groupStyle.backgroundColor ?? DEFAULT_GROUP_BG,
                borderBottom: bs,
              }}
            >
              {el.fields.map((f, i) => {
                const total = el.totals.find((t) => t.fieldKey === f.key)
                const value = total ? aggregateField(group.records, f.key, total.formula) : null
                return (
                  <div
                    key={i}
                    style={{
                      ...baseCellLayout(colPcts[i], i < el.fields.length - 1 ? bs : undefined),
                      fontWeight: groupStyle.fontWeight ?? 'bold',
                      textAlign: (f.align ?? 'left') as React.CSSProperties['textAlign'],
                      color: groupStyle.color,
                      borderBottom: 'none',
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

      {emptyCount > 0 && <EmptyRows count={emptyCount} itemHeight={el.itemHeight} bs={bs} />}

      {hasFooter && (
        <FooterRow fields={el.fields} colPcts={colPcts} bs={bs} records={allRecords} totals={el.totals} label={el.totals[0]?.label} />
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
}

export const RepeatingBandRenderer = memo(function RepeatingBandRenderer({ element, records }: Props) {
  if (records === undefined) {
    return <RepeatingBandDesignPreview element={element} />
  }
  if (isGroupedElement(element)) {
    return <GroupedBandRenderer el={element} records={records} />
  }
  return <FlatBandRenderer el={element} records={records} />
})
