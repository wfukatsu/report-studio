import type { RepeatingBandElement } from '@/types'
import {
  CELL_FONT_SIZE,
  EMPTY_TEXT_COLOR,
  outerBorderStr,
  headerBorderStr,
  dataBorderStr,
  columnBorderStr,
  footerBorderStr,
  columnPercents,
  sortRecords,
} from './bandStyles'
import { BandContainer, HeaderRow, DataRow, FooterRow, EmptyRows } from './BandParts'

// ---------------------------------------------------------------------------
// Live renderer — flat path (no groupBy)
// ---------------------------------------------------------------------------

export function FlatBandRenderer({
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
          {el.fields.map((_, i) => (
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
