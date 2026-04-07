import { memo } from 'react'
import type { FormTableElement, FormTableRow, FormTableCell } from '@/types'
import { resolveField } from '@/lib/dataBinding'

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function cellStyle(
  align?: string,
  bg?: string,
  fontSize?: number | string,
  fw?: string,
  color?: string,
  borderRight?: string,
  borderBottom?: string,
): React.CSSProperties {
  return {
    padding: '0.5mm 1mm',
    fontSize: fontSize ? (typeof fontSize === 'number' ? `${fontSize}mm` : fontSize) : '2.8mm',
    textAlign: (align ?? 'left') as React.CSSProperties['textAlign'],
    backgroundColor: bg,
    fontWeight: fw as React.CSSProperties['fontWeight'],
    color: color,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    borderRight,
    borderBottom,
    boxSizing: 'border-box',
  }
}

// ---------------------------------------------------------------------------
// Cell content renderer
// ---------------------------------------------------------------------------

function CellContent({
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

  // dataField
  if (record && cell.fieldKey) {
    const value = resolveField(record, cell.fieldKey)
    return <span>{value != null ? String(value) : (cell.fallbackText ?? '')}</span>
  }

  // design preview for dataField
  return (
    <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
      {`{{${cell.fieldKey ?? ''}}}`}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Design preview (no real data)
// ---------------------------------------------------------------------------

function FormTableDesignPreview({ element: el }: { element: FormTableElement }) {
  const bw = `${el.borderWidth ?? 0.3}mm`
  const bs = `${bw} solid ${el.borderColor ?? '#000000'}`
  const colWidths = el.columns.map((c) => `${c.width}mm`)

  // Separate rows by role
  const headerRows = el.rows.filter((r) => r.role === 'header')
  const bodyRows = el.rows.filter((r) => r.role === 'body')
  const footerRows = el.rows.filter((r) => r.role === 'footer')

  const hasDataBind = Boolean(el.dataSource)

  const renderRow = (row: FormTableRow, rowIdx: number, sectionRows: FormTableRow[]) => {
    const isLastRow = rowIdx === sectionRows.length - 1
    return (
      <div
        key={row.id}
        style={{
          display: 'flex',
          height: `${row.height}mm`,
          flexShrink: 0,
          borderBottom: !isLastRow || footerRows.length > 0 || bodyRows.length > 0 ? bs : undefined,
          boxSizing: 'border-box',
        }}
      >
        {el.columns.map((col, colIdx) => {
          const cell = row.cells[colIdx]
          const isLastCol = colIdx === el.columns.length - 1
          const bg =
            row.role === 'header'
              ? (el.headerStyle?.backgroundColor ?? '#f3f4f6')
              : row.role === 'footer'
                ? '#f9fafb'
                : undefined
          const fw =
            row.role === 'header' || row.role === 'footer'
              ? (el.headerStyle?.fontWeight ?? 'bold')
              : el.bodyStyle?.fontWeight
          const mergedAlign = cell?.style?.textAlign ?? col.align ?? 'left'
          const mergedColor = cell?.style?.color ?? col.style?.color ?? el.headerStyle?.color
          const mergedFontSize =
            cell?.style?.fontSize ?? col.style?.fontSize ?? el.headerStyle?.fontSize

          return (
            <div
              key={col.id}
              style={{
                ...cellStyle(
                  mergedAlign,
                  cell?.style?.backgroundColor ?? bg,
                  mergedFontSize,
                  fw as string,
                  mergedColor,
                  !isLastCol ? bs : undefined,
                  undefined,
                ),
                width: colWidths[colIdx],
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {cell ? <CellContent cell={cell} /> : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: bs,
        boxSizing: 'border-box',
        fontFamily: 'sans-serif',
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
          帳票テーブル · {el.dataSource}
        </div>
      )}

      {/* Header rows */}
      {headerRows.map((r, i) => renderRow(r, i, headerRows))}

      {/* Body rows */}
      {bodyRows.map((r, i) => renderRow(r, i, bodyRows))}

      {/* Data-bind expansion hint (shown only when dataSource set) */}
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
          {(el.maxItems ?? 0) > 0 ? `最大 ${el.maxItems} 件` : 'レコード数分 繰り返し'}
        </div>
      )}

      {/* Footer rows */}
      {footerRows.map((r, i) => renderRow(r, i, footerRows))}
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
  const bw = `${el.borderWidth ?? 0.3}mm`
  const bs = `${bw} solid ${el.borderColor ?? '#000000'}`
  const colWidths = el.columns.map((c) => `${c.width}mm`)

  const headerRows = el.rows.filter((r) => r.role === 'header')
  const bodyRows = el.rows.filter((r) => r.role === 'body')
  const footerRows = el.rows.filter((r) => r.role === 'footer')

  const limited = (el.maxItems ?? 0) > 0 ? records.slice(0, el.maxItems) : records

  const renderRow = (
    row: FormTableRow,
    rowIdx: number,
    record?: Record<string, unknown>,
  ) => (
    <div
      key={`${row.id}-${rowIdx}`}
      style={{
        display: 'flex',
        height: `${row.height}mm`,
        flexShrink: 0,
        borderBottom: bs,
        boxSizing: 'border-box',
      }}
    >
      {el.columns.map((col, colIdx) => {
        const cell = row.cells[colIdx]
        const isLastCol = colIdx === el.columns.length - 1
        const bg =
          row.role === 'header'
            ? (el.headerStyle?.backgroundColor ?? '#f3f4f6')
            : row.role === 'footer'
              ? '#f9fafb'
              : row.role === 'body' && record
                ? rowIdx % 2 === 0
                  ? el.oddRowColor
                  : el.evenRowColor
                : undefined
        const fw =
          row.role === 'header' || row.role === 'footer'
            ? (el.headerStyle?.fontWeight ?? 'bold')
            : el.bodyStyle?.fontWeight
        const mergedAlign = cell?.style?.textAlign ?? col.align ?? 'left'
        const mergedColor = cell?.style?.color ?? col.style?.color
        const mergedFontSize = cell?.style?.fontSize ?? col.style?.fontSize

        return (
          <div
            key={col.id}
            style={{
              ...cellStyle(
                mergedAlign,
                cell?.style?.backgroundColor ?? bg,
                mergedFontSize,
                fw as string,
                mergedColor,
                !isLastCol ? bs : undefined,
                undefined,
              ),
              width: colWidths[colIdx],
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {cell ? <CellContent cell={cell} record={record} /> : null}
          </div>
        )
      })}
    </div>
  )

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: bs,
        boxSizing: 'border-box',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Header rows */}
      {headerRows.map((r, i) => renderRow(r, i))}

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
          データなし
        </div>
      ) : (
        limited.map((record, recordIdx) =>
          bodyRows.map((row) => renderRow(row, recordIdx, record)),
        )
      )}

      {/* Footer rows */}
      {footerRows.map((r, i) => renderRow(r, i))}
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
