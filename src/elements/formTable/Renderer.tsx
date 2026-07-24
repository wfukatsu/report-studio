import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { FormTableElement, FormTableRow, FormTableCell, EraSelectLayout } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { DEFAULT_ERAS } from '@/lib/eras'
import { DEFAULT_CELL_FONT_SIZE_PT } from '@/elements/_blocks/constants'
import { REPORT_SANS_STACK } from '@/lib/styleUtils'

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function cellStyle(
  align?: string,
  bg?: string,
  fontSize?: number | string,
  fw?: string,
  color?: string,
): React.CSSProperties {
  return {
    padding: '0.5mm 1mm',
    fontSize: fontSize ? (typeof fontSize === 'number' ? `${fontSize}pt` : fontSize) : `${DEFAULT_CELL_FONT_SIZE_PT}pt`,
    textAlign: (align ?? 'left') as React.CSSProperties['textAlign'],
    backgroundColor: bg,
    fontWeight: fw as React.CSSProperties['fontWeight'],
    color: color,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  }
}

/** Build CSS Grid column template from column widths */
function gridTemplateColumns(el: FormTableElement): string {
  return el.columns.map((c) => `${c.width}mm`).join(' ')
}

// ---------------------------------------------------------------------------
// Cell content renderer
// ---------------------------------------------------------------------------

export function CellContent({
  cell,
  record,
}: {
  cell: FormTableCell
  record?: Record<string, unknown>
}) {
  if (cell.type === 'label') {
    return <span>{cell.text ?? ''}</span>
  }

  if (cell.type === 'input') {
    return (
      <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
        {cell.placeholder ?? ''}
      </span>
    )
  }

  if (cell.type === 'checkbox') {
    const isChecked = cell.checkboxDataSource && record
      ? resolveField(record, cell.checkboxDataSource) !== ''
      : cell.checked ?? false
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5mm' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '3mm', height: '3mm', border: '0.25mm solid #000', fontSize: '2.2mm',
          lineHeight: 1, flexShrink: 0,
        }}>
          {isChecked ? (cell.checkmark ?? '✓') : ''}
        </span>
        {cell.text && <span>{cell.text}</span>}
      </span>
    )
  }

  if (cell.type === 'eraSelect') {
    const selected = cell.eraDataSource && record
      ? resolveField(record, cell.eraDataSource)
      : ''
    const eras = DEFAULT_ERAS
    const layout: EraSelectLayout = cell.eraLayout ?? 'column'
    return (
      <div style={{
        display: 'flex',
        flexDirection: layout === 'row' ? 'row' : 'column',
        justifyContent: 'space-around',
        alignItems: layout === 'row' ? 'center' : undefined,
        height: '100%', fontSize: '2mm', lineHeight: 1,
      }}>
        {eras.map((era) => (
          <span key={era} style={{ display: 'flex', alignItems: 'center', gap: '0.2mm' }}>
            <span>{selected === era ? '●' : '○'}</span>
            <span>{era}</span>
          </span>
        ))}
      </div>
    )
  }

  // dataField
  if (record && cell.fieldKey) {
    const value = resolveField(record, cell.fieldKey)
    return <span>{value !== '' ? value : (cell.fallbackText ?? '')}</span>
  }

  // design preview for dataField
  return (
    <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
      {`{{${cell.fieldKey ?? ''}}}`}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Shared: render a row section as CSS Grid
// ---------------------------------------------------------------------------

interface GridRowSectionProps {
  el: FormTableElement
  rows: FormTableRow[]
  record?: Record<string, unknown>
  recordIdx?: number
  borderStyle: string
  showBottomBorder?: boolean
}

function GridRowSection({
  el,
  rows,
  record,
  recordIdx,
  borderStyle,
  showBottomBorder = false,
}: GridRowSectionProps) {
  if (rows.length === 0) return null

  const gridRows = rows.map((r) => `${r.height}mm`).join(' ')

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplateColumns(el),
        gridTemplateRows: gridRows,
        borderBottom: showBottomBorder ? borderStyle : undefined,
        boxSizing: 'border-box',
      }}
    >
      {rows.map((row, rowIdx) =>
        el.columns.map((col, colIdx) => {
          const cell = row.cells[colIdx]

          // Skip merged cells
          if (cell?.mergedInto) return null

          const colspan = cell?.colspan ?? 1
          const rowspan = cell?.rowspan ?? 1
          const isLastCol = colIdx + colspan >= el.columns.length
          const isLastRow = rowIdx + rowspan >= rows.length

          const bg = resolveBackground(el, row, cell, recordIdx)
          const fw = resolveFontWeight(el, row)
          const mergedAlign = cell?.style?.textAlign ?? col.align ?? 'left'
          const mergedColor = cell?.style?.color ?? col.style?.color ?? (row.role === 'header' ? el.headerStyle?.color : undefined)
          const mergedFontSize = cell?.style?.fontSize ?? col.style?.fontSize ?? (row.role === 'header' ? el.headerStyle?.fontSize : undefined)

          return (
            <div
              key={`${row.id}-${col.id}`}
              data-cell-id={cell?.id}
              data-row-idx={rowIdx}
              data-col-idx={colIdx}
              style={{
                ...cellStyle(
                  mergedAlign,
                  cell?.style?.backgroundColor ?? bg,
                  mergedFontSize,
                  fw as string,
                  mergedColor,
                ),
                gridColumn: colspan > 1 ? `span ${colspan}` : undefined,
                gridRow: rowspan > 1 ? `span ${rowspan}` : undefined,
                borderRight: !isLastCol ? borderStyle : undefined,
                borderBottom: (!isLastRow || showBottomBorder) ? borderStyle : undefined,
              }}
            >
              {cell ? <CellContent cell={cell} record={record} /> : null}
            </div>
          )
        }),
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Style resolution helpers
// ---------------------------------------------------------------------------

function resolveBackground(
  el: FormTableElement,
  row: FormTableRow,
  cell: FormTableCell | undefined,
  recordIdx?: number,
): string | undefined {
  if (cell?.style?.backgroundColor) return cell.style.backgroundColor
  if (row.role === 'header') return el.headerStyle?.backgroundColor ?? '#f3f4f6'
  if (row.role === 'footer') return '#f9fafb'
  if (row.role === 'body' && recordIdx !== undefined) {
    return recordIdx % 2 === 0 ? el.oddRowColor : el.evenRowColor
  }
  return undefined
}

function resolveFontWeight(el: FormTableElement, row: FormTableRow): string | undefined {
  if (row.role === 'header' || row.role === 'footer') {
    return (el.headerStyle?.fontWeight ?? 'bold') as string
  }
  return el.bodyStyle?.fontWeight as string | undefined
}

// ---------------------------------------------------------------------------
// Design preview (no real data)
// ---------------------------------------------------------------------------

function FormTableDesignPreview({ element: el }: { element: FormTableElement }) {
  const { t } = useTranslation('elements')
  const bw = `${el.borderWidth ?? 0.3}mm`
  const bs = `${bw} solid ${el.borderColor ?? '#000000'}`

  const headerRows = el.rows.filter((r) => r.role === 'header')
  const bodyRows = el.rows.filter((r) => r.role === 'body')
  const footerRows = el.rows.filter((r) => r.role === 'footer')

  const hasDataBind = Boolean(el.dataSource)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: bs,
        boxSizing: 'border-box',
        fontFamily: REPORT_SANS_STACK,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {hasDataBind && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: '#3b82f6',
            color: '#ffffff',
            fontSize: '2mm',
            padding: '0.5mm 1.5mm',
            borderBottomLeftRadius: '1mm',
            zIndex: 10,
            fontWeight: 'bold',
            letterSpacing: '0.05em',
          }}
        >
          {t('formTable.badge')} · {el.dataSource}
        </div>
      )}

      {/* Header rows */}
      <GridRowSection
        el={el}
        rows={headerRows}
        borderStyle={bs}
        showBottomBorder={bodyRows.length > 0 || footerRows.length > 0}
      />

      {/* Body rows */}
      <GridRowSection
        el={el}
        rows={bodyRows}
        borderStyle={bs}
        showBottomBorder={hasDataBind || footerRows.length > 0}
      />

      {/* Data-bind expansion hint */}
      {hasDataBind && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#93c5fd',
            fontSize: '2.5mm',
            borderBottom: footerRows.length > 0 ? bs : undefined,
            background:
              'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(219,234,254,0.3) 4px, rgba(219,234,254,0.3) 8px)',
          }}
        >
          ↻{' '}
          {(el.maxItems ?? 0) > 0 ? t('formTable.repeatMax', { n: el.maxItems }) : t('formTable.repeatAll')}
        </div>
      )}

      {/* Footer rows */}
      <GridRowSection
        el={el}
        rows={footerRows}
        borderStyle={bs}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live renderer (real array data — body rows repeated per record)
// ---------------------------------------------------------------------------

function FormTableLiveRenderer({
  element: el,
  records,
}: {
  element: FormTableElement
  records: Record<string, unknown>[]
}) {
  const { t } = useTranslation('elements')
  const bw = `${el.borderWidth ?? 0.3}mm`
  const bs = `${bw} solid ${el.borderColor ?? '#000000'}`

  const headerRows = el.rows.filter((r) => r.role === 'header')
  const bodyRows = el.rows.filter((r) => r.role === 'body')
  const footerRows = el.rows.filter((r) => r.role === 'footer')

  const limited = (el.maxItems ?? 0) > 0 ? records.slice(0, el.maxItems) : records

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: bs,
        boxSizing: 'border-box',
        fontFamily: REPORT_SANS_STACK,
        overflow: 'hidden',
      }}
    >
      {/* Header rows */}
      <GridRowSection
        el={el}
        rows={headerRows}
        borderStyle={bs}
        showBottomBorder={bodyRows.length > 0 || limited.length > 0 || footerRows.length > 0}
      />

      {/* Body rows × records */}
      {limited.length === 0 ? (
        <div
          style={{
            display: 'flex',
            height: '8mm',
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: '2.8mm',
            borderBottom: footerRows.length > 0 ? bs : undefined,
          }}
        >
          {t('formTable.noData')}
        </div>
      ) : (
        limited.map((record, recordIdx) => (
          <GridRowSection
            key={recordIdx}
            el={el}
            rows={bodyRows}
            record={record}
            recordIdx={recordIdx}
            borderStyle={bs}
            showBottomBorder={recordIdx < limited.length - 1 || footerRows.length > 0}
          />
        ))
      )}

      {/* Footer rows */}
      <GridRowSection
        el={el}
        rows={footerRows}
        borderStyle={bs}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

interface Props {
  element: FormTableElement
  /** Live Preview 時に渡す配列データ。undefined = デザインプレビュー表示 */
  records?: Record<string, unknown>[]
}

export const FormTableRenderer = memo(function FormTableRenderer({ element, records }: Props) {
  if (records === undefined) {
    return <FormTableDesignPreview element={element} />
  }
  return <FormTableLiveRenderer element={element} records={records} />
})
