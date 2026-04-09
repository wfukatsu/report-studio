import { memo } from 'react'
import type { RepeatingBandElement, TextStyle } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { aggregateField } from '@/lib/aggregation'
import { groupRecords, applyGroupedMaxItems, countGroupedRows } from '@/lib/grouping'

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

function cellStyle(
  align?: string,
  bg?: string,
  fw?: string,
  borderStyle?: string,
): React.CSSProperties {
  return {
    padding: '0.5mm 1mm',
    fontSize: '2.8mm',
    textAlign: (align ?? 'left') as React.CSSProperties['textAlign'],
    backgroundColor: bg,
    fontWeight: fw as React.CSSProperties['fontWeight'],
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    borderRight: borderStyle,
    borderBottom: borderStyle,
    boxSizing: 'border-box',
  }
}

/** Apply TextStyle overrides to a base CSSProperties */
function applyTextStyle(base: React.CSSProperties, ts?: TextStyle): React.CSSProperties {
  if (!ts) return base
  const result = { ...base }
  if (ts.fontSize) result.fontSize = `${ts.fontSize}mm`
  if (ts.fontWeight) result.fontWeight = ts.fontWeight
  if (ts.fontStyle) result.fontStyle = ts.fontStyle
  if (ts.color) result.color = ts.color
  if (ts.backgroundColor) result.backgroundColor = ts.backgroundColor
  if (ts.textAlign) result.textAlign = ts.textAlign
  return result
}

// Default group subtotal style
const DEFAULT_GROUP_STYLE: TextStyle = {
  backgroundColor: '#e8ecef',
  fontWeight: 'bold',
}

// ---------------------------------------------------------------------------
// Design preview (no real data — shows faded mock rows)
// ---------------------------------------------------------------------------

function RepeatingBandDesignPreview({ element: el }: { element: RepeatingBandElement }) {
  const HEADER_H = el.showHeader ? el.itemHeight : 0
  const FOOTER_H = el.showFooter && el.totals.length > 0 ? el.itemHeight : 0
  const PREVIEW_ROWS = 3
  const bw = `${el.borderWidth ?? 0.3}mm`
  const bs = `${bw} solid ${el.borderColor ?? '#000000'}`
  const totalWidth = el.fields.reduce((s, f) => s + f.width, 0)
  const colPcts = el.fields.map((f) => `${(f.width / totalWidth) * 100}%`)
  const isGrouped = !!el.groupBy

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: bs, boxSizing: 'border-box', fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, background: '#3b82f6', color: '#ffffff', fontSize: '2mm', padding: '0.5mm 1.5mm', borderBottomLeftRadius: '1mm', zIndex: 10, fontWeight: 'bold', letterSpacing: '0.05em' }}>
        繰り返しバンド · {el.dataSource}{isGrouped ? ` (${el.groupBy}でグループ化)` : ''}
      </div>
      {el.showHeader && (
        <div style={{ display: 'flex', height: `${HEADER_H}mm`, flexShrink: 0, borderBottom: bs }}>
          {el.fields.map((f, i) => (
            <div key={i} style={{ ...cellStyle('center', el.headerStyle?.backgroundColor ?? '#f3f4f6', 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: 'none' }}>
              {f.label}
            </div>
          ))}
        </div>
      )}

      {/* Grouped preview */}
      {isGrouped ? (
        <>
          {/* Group header mock */}
          <div style={{ height: `${el.itemHeight}mm`, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 1mm', backgroundColor: el.headerStyle?.backgroundColor ?? '#e2e8f0', borderBottom: bs, fontWeight: 'bold', fontSize: '2.8mm', color: el.headerStyle?.color ?? '#1a1a1a' }}>
            ■ グループ 1
          </div>
          {/* Data rows mock */}
          {Array.from({ length: 2 }, (_, rowIdx) => (
            <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : 0.7 }}>
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...cellStyle(f.align, undefined, undefined, i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: bs }}>
                  {rowIdx === 0 ? <span style={{ color: '#6b7280', fontStyle: 'italic' }}>{`{{${f.key}}}`}</span> : <span style={{ color: '#d1d5db' }}>{'▬▬'}</span>}
                </div>
              ))}
            </div>
          ))}
          {/* Group subtotal mock */}
          {el.showGroupSubtotals && (
            <div data-testid="group-subtotal-preview" style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: (el.groupStyle ?? DEFAULT_GROUP_STYLE).backgroundColor ?? '#e8ecef', borderBottom: bs }}>
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...cellStyle(f.align, undefined, 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: 'none' }}>
                  {i === 0 ? '小計' : el.totals.find((t) => t.fieldKey === f.key) ? 'Σ' : ''}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Flat preview rows */
        Array.from({ length: PREVIEW_ROWS }, (_, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : rowIdx === 1 ? 0.7 : 0.4 }}>
            {el.fields.map((f, i) => (
              <div key={i} style={{ ...cellStyle(f.align, undefined, undefined, i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: bs }}>
                {rowIdx === 0 ? <span style={{ color: '#6b7280', fontStyle: 'italic' }}>{`{{${f.key}}}`}</span> : <span style={{ color: '#d1d5db' }}>{'▬▬▬'.slice(0, 3 - rowIdx)}</span>}
              </div>
            ))}
          </div>
        ))
      )}

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93c5fd', fontSize: '2.5mm', borderBottom: el.showFooter ? bs : 'none', background: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(219,234,254,0.3) 4px, rgba(219,234,254,0.3) 8px)' }}>
        ↻ {el.maxItems > 0 ? `最大 ${el.maxItems} 件` : 'レコード数分 繰り返し'}
      </div>
      {el.showFooter && el.totals.length > 0 && (
        <div style={{ display: 'flex', height: `${FOOTER_H}mm`, flexShrink: 0, borderTop: bs }}>
          {el.fields.map((f, i) => {
            const total = el.totals.find((t) => t.fieldKey === f.key)
            return (
              <div key={i} style={{ ...cellStyle(f.align, '#f9fafb', 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: f.align === 'right' ? 'flex-end' : f.align === 'center' ? 'center' : 'flex-start', borderBottom: 'none' }}>
                {total ? <span>{total.label ?? total.fieldKey} ({total.formula})</span> : i === 0 ? <span style={{ color: '#6b7280' }}>{el.totals[0]?.label ?? '合計'}</span> : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live renderer (real array data)
// ---------------------------------------------------------------------------

function RepeatingBandLiveRenderer({
  element: el,
  records,
}: {
  element: RepeatingBandElement
  records: Record<string, unknown>[]
}) {
  const bw = `${el.borderWidth ?? 0.3}mm`
  const bs = `${bw} solid ${el.borderColor ?? '#000000'}`
  const totalWidth = el.fields.reduce((s, f) => s + f.width, 0)
  const colPcts = el.fields.map((f) => `${(f.width / totalWidth) * 100}%`)

  const hasFooter = el.showFooter && el.totals.length > 0
  const HEADER_H = el.showHeader ? el.itemHeight : 0
  const FOOTER_H = hasFooter ? el.itemHeight : 0

  // ---- groupBy path ----
  if (el.groupBy) {
    return (
      <GroupedBandRenderer
        el={el}
        records={records}
        bs={bs}
        colPcts={colPcts}
        hasFooter={hasFooter}
        headerH={HEADER_H}
        footerH={FOOTER_H}
      />
    )
  }

  // ---- flat path (unchanged) ----

  // Apply maxItems limit
  const limited = el.maxItems > 0 ? records.slice(0, el.maxItems) : records

  // Apply sort — capture sortKey before closure to avoid non-null assertion
  const sortKey = el.sortBy
  const sorted = sortKey
    ? [...limited].sort((a, b) => {
        const va = resolveField(a, sortKey)
        const vb = resolveField(b, sortKey)
        return el.sortOrder === 'desc'
          ? String(vb).localeCompare(String(va))
          : String(va).localeCompare(String(vb))
      })
    : limited

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: bs, boxSizing: 'border-box', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      {/* Header row */}
      {el.showHeader && (
        <div style={{ display: 'flex', height: `${HEADER_H}mm`, flexShrink: 0, borderBottom: bs }}>
          {el.fields.map((f, i) => (
            <div key={i} style={{ ...cellStyle('center', el.headerStyle?.backgroundColor ?? '#f3f4f6', 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: 'none' }}>
              {f.label}
            </div>
          ))}
        </div>
      )}

      {/* Data rows */}
      {sorted.length === 0 && !el.showEmptyRowLines ? (
        <div style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '2.8mm', borderBottom: hasFooter ? bs : undefined }}>
          データなし
        </div>
      ) : (
        sorted.map((record, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor }}>
            {el.fields.map((f, i) => (
              <div key={i} style={{ ...cellStyle(f.align, undefined, undefined, i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: bs }}>
                {resolveField(record, f.key)}
              </div>
            ))}
          </div>
        ))
      )}

      {/* Empty row lines (showEmptyRowLines) */}
      {el.showEmptyRowLines && el.maxItems > 0 && (() => {
        const emptyCount = Math.max(0, el.maxItems - sorted.length)
        return Array.from({ length: emptyCount }, (_, i) => (
          <div key={`empty-${i}`} data-testid="empty-row-line" style={{ height: `${el.itemHeight}mm`, flexShrink: 0, borderBottom: bs }} />
        ))
      })()}

      {/* Footer totals row */}
      {hasFooter && (
        <div style={{ display: 'flex', height: `${FOOTER_H}mm`, flexShrink: 0, borderTop: bs }}>
          {el.fields.map((f, i) => {
            const total = el.totals.find((t) => t.fieldKey === f.key)
            const value = total ? aggregateField(sorted, f.key, total.formula) : null
            return (
              <div key={i} style={{ ...cellStyle(f.align, '#f9fafb', 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: f.align === 'right' ? 'flex-end' : f.align === 'center' ? 'center' : 'flex-start', borderBottom: 'none' }}>
                {value !== null ? String(Math.round(value * 100) / 100) : (i === 0 ? <span style={{ color: '#6b7280' }}>{el.totals[0]?.label ?? '合計'}</span> : null)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grouped band renderer (groupBy path)
// ---------------------------------------------------------------------------

function GroupedBandRenderer({
  el,
  records,
  bs,
  colPcts,
  hasFooter,
  headerH,
  footerH,
}: {
  el: RepeatingBandElement
  records: Record<string, unknown>[]
  bs: string
  colPcts: string[]
  hasFooter: boolean
  headerH: number
  footerH: number
}) {
  const groupByField = el.groupBy!
  const hasSubtotals = !!el.showGroupSubtotals && el.totals.length > 0
  const groupStyle = el.groupStyle ?? DEFAULT_GROUP_STYLE

  // 1. Group records
  let groups = groupRecords(records, groupByField)

  // 2. Apply maxItems (total visible rows including headers + subtotals)
  if (el.maxItems > 0) {
    groups = applyGroupedMaxItems(groups, el.maxItems, hasSubtotals)
  }

  // 3. Sort within each group
  const sortKey = el.sortBy
  if (sortKey) {
    groups = groups.map((g) => ({
      ...g,
      records: [...g.records].sort((a, b) => {
        const va = resolveField(a, sortKey)
        const vb = resolveField(b, sortKey)
        return el.sortOrder === 'desc'
          ? String(vb).localeCompare(String(va))
          : String(va).localeCompare(String(vb))
      }),
    }))
  }

  // 4. Compute empty row count
  const consumedRows = countGroupedRows(groups, hasSubtotals)
  const emptyRowCount = el.showEmptyRowLines && el.maxItems > 0
    ? Math.max(0, el.maxItems - consumedRows)
    : 0

  // 5. Collect all records for grand total
  const allRecords = groups.flatMap((g) => g.records)

  // Determine which field indices correspond to groupBy (auto-hide in data rows)
  const groupByFieldIndices = el.fields
    .map((f, i) => f.key === groupByField ? i : -1)
    .filter((i) => i >= 0)

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: bs, boxSizing: 'border-box', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      {/* Column header row */}
      {el.showHeader && (
        <div style={{ display: 'flex', height: `${headerH}mm`, flexShrink: 0, borderBottom: bs }}>
          {el.fields.map((f, i) => (
            <div key={i} style={{ ...cellStyle('center', el.headerStyle?.backgroundColor ?? '#f3f4f6', 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: 'none' }}>
              {f.label}
            </div>
          ))}
        </div>
      )}

      {/* Grouped rows */}
      {groups.map((group, gIdx) => (
        <div key={gIdx} data-testid="group-section">
          {/* Group header row */}
          <div
            data-testid="group-header"
            style={{
              height: `${el.itemHeight}mm`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              padding: '0 1mm',
              backgroundColor: el.headerStyle?.backgroundColor ?? '#e2e8f0',
              borderBottom: bs,
              ...applyTextStyle({
                fontWeight: 'bold',
                fontSize: '2.8mm',
                color: el.headerStyle?.color ?? '#1a1a1a',
              }, el.headerStyle),
            }}
          >
            ■ {group.groupValue}
          </div>

          {/* Data rows within group */}
          {group.records.map((record, rowIdx) => (
            <div
              key={rowIdx}
              data-testid="group-data-row"
              style={{
                display: 'flex',
                height: `${el.itemHeight}mm`,
                flexShrink: 0,
                backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor,
              }}
            >
              {el.fields.map((f, i) => (
                <div key={i} style={{ ...cellStyle(f.align, undefined, undefined, i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: bs }}>
                  {groupByFieldIndices.includes(i) ? '' : resolveField(record, f.key)}
                </div>
              ))}
            </div>
          ))}

          {/* Group subtotal row */}
          {hasSubtotals && (
            <div
              data-testid="group-subtotal"
              style={{
                display: 'flex',
                height: `${el.itemHeight}mm`,
                flexShrink: 0,
                backgroundColor: groupStyle.backgroundColor ?? '#e8ecef',
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
                      ...cellStyle(
                        f.align,
                        undefined,
                        groupStyle.fontWeight ?? 'bold',
                        i < el.fields.length - 1 ? bs : undefined,
                      ),
                      width: colPcts[i],
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: f.align === 'right' ? 'flex-end' : f.align === 'center' ? 'center' : 'flex-start',
                      borderBottom: 'none',
                      color: groupStyle.color,
                    }}
                  >
                    {value !== null
                      ? String(Math.round(value * 100) / 100)
                      : (i === 0 ? '小計' : '')}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Empty row lines */}
      {emptyRowCount > 0 && Array.from({ length: emptyRowCount }, (_, i) => (
        <div key={`empty-${i}`} data-testid="empty-row-line" style={{ height: `${el.itemHeight}mm`, flexShrink: 0, borderBottom: bs }} />
      ))}

      {/* Footer totals row (grand total) */}
      {hasFooter && (
        <div style={{ display: 'flex', height: `${footerH}mm`, flexShrink: 0, borderTop: bs }}>
          {el.fields.map((f, i) => {
            const total = el.totals.find((t) => t.fieldKey === f.key)
            const value = total ? aggregateField(allRecords, f.key, total.formula) : null
            return (
              <div key={i} style={{ ...cellStyle(f.align, '#f9fafb', 'bold', i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: f.align === 'right' ? 'flex-end' : f.align === 'center' ? 'center' : 'flex-start', borderBottom: 'none' }}>
                {value !== null ? String(Math.round(value * 100) / 100) : (i === 0 ? <span style={{ color: '#6b7280' }}>{el.totals[0]?.label ?? '合計'}</span> : null)}
              </div>
            )
          })}
        </div>
      )}
    </div>
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
  return <RepeatingBandLiveRenderer element={element} records={records} />
})
