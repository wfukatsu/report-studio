import { useTranslation } from 'react-i18next'
import type { RepeatingBandElement } from '@/types'
import { aggregateField } from '@/lib/aggregation'
import { groupRecords, applyGroupedMaxItems, countGroupedRows } from '@/lib/grouping'
import {
  CELL_FONT_SIZE,
  DEFAULT_HEADER_COLOR,
  DEFAULT_GROUP_BG,
  DEFAULT_GROUP_STYLE,
  outerBorderStr,
  headerBorderStr,
  dataBorderStr,
  columnBorderStr,
  footerBorderStr,
  columnPercents,
  baseCellLayout,
  withTextStyle,
  sortRecords,
  alignToJustify,
  formatAggregate,
} from './bandStyles'
import { BandContainer, HeaderRow, DataRow, FooterRow, EmptyRows } from './BandParts'

// ---------------------------------------------------------------------------
// Live renderer — grouped path (groupBy set)
// ---------------------------------------------------------------------------

export function GroupedBandRenderer({
  el, records,
}: {
  el: RepeatingBandElement & { groupBy: string }
  records: Record<string, unknown>[]
}) {
  const { t } = useTranslation('elements')
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
        // headerHeight falls back to itemHeight — same parity rule as FlatBandRenderer (#324)
        <HeaderRow fields={el.fields} colPcts={colPcts} hbs={hbs} cbs={cbs} headerStyle={el.headerStyle} headerHeight={el.headerHeight ?? el.itemHeight} />
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
              cellStyle={el.style}
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
                const total = el.totals.find((tot) => tot.fieldKey === f.key)
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
                    {value !== null ? formatAggregate(value, f) : (i === 0 ? t('repeatingBand.subtotal') : '')}
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
          {el.fields.map((_, i) => (
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
