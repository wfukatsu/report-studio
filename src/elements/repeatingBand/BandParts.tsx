import type { RepeatingBandElement, RepeatingBandField, TextStyle } from '@/types'
import { aggregateField } from '@/lib/aggregation'
import {
  DEFAULT_HEADER_BG,
  DEFAULT_HEADER_COLOR,
  DEFAULT_FOOTER_BG,
  PLACEHOLDER_COLOR,
  baseCellLayout,
  alignToJustify,
  effectiveAlign,
  resolveAndFormat,
  formatAggregate,
} from './bandStyles'

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Column header row */
export function HeaderRow({
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
export function DataRow({
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
export function FooterRow({
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
export function EmptyRows({ count, itemHeight, dbs }: { count: number; itemHeight: number; dbs: string }) {
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

export function BandContainer({
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
