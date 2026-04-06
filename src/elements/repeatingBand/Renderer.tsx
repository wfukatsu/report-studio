import { memo } from 'react'
import type { RepeatingBandElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { aggregateField } from '@/lib/aggregation'

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

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: bs, boxSizing: 'border-box', fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, background: '#3b82f6', color: '#ffffff', fontSize: '2mm', padding: '0.5mm 1.5mm', borderBottomLeftRadius: '1mm', zIndex: 10, fontWeight: 'bold', letterSpacing: '0.05em' }}>
        繰り返しバンド · {el.dataSource}
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
      {Array.from({ length: PREVIEW_ROWS }, (_, rowIdx) => (
        <div key={rowIdx} style={{ display: 'flex', height: `${el.itemHeight}mm`, flexShrink: 0, backgroundColor: rowIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor, opacity: rowIdx === 0 ? 1 : rowIdx === 1 ? 0.7 : 0.4 }}>
          {el.fields.map((f, i) => (
            <div key={i} style={{ ...cellStyle(f.align, undefined, undefined, i < el.fields.length - 1 ? bs : undefined), width: colPcts[i], flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: bs }}>
              {rowIdx === 0 ? <span style={{ color: '#6b7280', fontStyle: 'italic' }}>{`{{${f.key}}}`}</span> : <span style={{ color: '#d1d5db' }}>{'▬▬▬'.slice(0, 3 - rowIdx)}</span>}
            </div>
          ))}
        </div>
      ))}
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

  const hasFooter = el.showFooter && el.totals.length > 0
  const HEADER_H = el.showHeader ? el.itemHeight : 0
  const FOOTER_H = hasFooter ? el.itemHeight : 0

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
      {sorted.length === 0 ? (
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
