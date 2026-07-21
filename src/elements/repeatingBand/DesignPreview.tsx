import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RepeatingBandElement, RepeatingBandField } from '@/types'
import {
  CELL_FONT_SIZE,
  DEFAULT_HEADER_BG,
  DEFAULT_HEADER_COLOR,
  DEFAULT_FOOTER_BG,
  DEFAULT_GROUP_BG,
  DEFAULT_GROUP_STYLE,
  BADGE_BG,
  PLACEHOLDER_COLOR,
  MUTED_BAR_COLOR,
  outerBorderStr,
  headerBorderStr,
  dataBorderStr,
  columnBorderStr,
  footerBorderStr,
  columnPercents,
  baseCellLayout,
  alignToJustify,
} from './bandStyles'
import { BandContainer } from './BandParts'
import { ColumnEditor, type ColumnMenuState } from './ColumnEditor'

// ---------------------------------------------------------------------------
// Design preview (no real data — shows faded mock rows)
// with interactive column editing
// ---------------------------------------------------------------------------

export function RepeatingBandDesignPreview({ element: el, onFieldsChange }: { element: RepeatingBandElement; onFieldsChange?: (fields: RepeatingBandField[]) => void }) {
  const obs = outerBorderStr(el)

  // All hooks must run before the empty-state early return below —
  // otherwise the hook order changes when fields go 0 → n (Rules of Hooks, issue #62)

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

  return (
    <BandContainer el={el} bs={obs}>
      {/* Interactive header row (design mode) */}
      {el.showHeader && (
        <div
          style={{ display: 'flex', flexShrink: 0, borderBottom: hbs, height: `${el.headerHeight ?? el.itemHeight}mm` }}
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
