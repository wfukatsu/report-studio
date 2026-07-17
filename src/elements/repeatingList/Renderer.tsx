import { memo } from 'react'
import type { RepeatingListElement, RepeatingListField } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { DEFAULT_CELL_FONT_SIZE_PT, FIELD_PLACEHOLDER_STYLE } from '@/elements/_blocks/constants'

// ---------------------------------------------------------------------------
// Shared card component
// ---------------------------------------------------------------------------

function ItemCard({
  fields,
  record,
  itemWidth,
  itemHeight,
  borderStyle,
  borderRadius,
  background,
  opacity,
}: {
  fields: RepeatingListField[]
  record?: Record<string, unknown>
  itemWidth: number
  itemHeight: number
  borderStyle: string
  borderRadius?: string
  background?: string
  opacity?: number
}) {
  return (
    <div style={{ width: `${itemWidth}mm`, height: `${itemHeight}mm`, flexShrink: 0, border: borderStyle, borderRadius, backgroundColor: background ?? '#ffffff', position: 'relative', overflow: 'hidden', opacity }}>
      {fields.map((f, fi) => (
        <div key={fi} style={{ position: 'absolute', left: `${f.x}mm`, top: `${f.y}mm`, width: `${f.width}mm`, height: `${f.height}mm`, fontSize: f.style?.fontSize ? `${f.style.fontSize}pt` : `${DEFAULT_CELL_FONT_SIZE_PT}pt`, fontWeight: f.style?.fontWeight, color: f.style?.color ?? '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {record
            ? (f.isLabel ? f.key : resolveField(record, f.key))
            : (f.isLabel ? f.key : <span style={FIELD_PLACEHOLDER_STYLE}>{`{{${f.key}}}`}</span>)}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Design preview (faded mock cards)
// ---------------------------------------------------------------------------

function RepeatingListDesignPreview({ element: el }: { element: RepeatingListElement }) {
  const bw = `${el.borderWidth ?? 0.3}mm`
  const borderStyle = el.borderColor ? `${bw} solid ${el.borderColor}` : 'none'
  const previewCount = Math.min(
    el.layout === 'grid' ? el.gridColumns * 2 : el.layout === 'horizontal' ? 4 : 3,
    4,
  )
  const isGrid = el.layout === 'grid'
  const isHorizontal = el.layout === 'horizontal'
  const borderRadius = el.borderRadius ? `${el.borderRadius}mm` : undefined

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, background: '#8b5cf6', color: '#ffffff', fontSize: '2mm', padding: '0.5mm 1.5mm', borderBottomLeftRadius: '1mm', zIndex: 10, fontWeight: 'bold' }}>
        繰り返しリスト · {el.dataSource}
      </div>
      <div style={{ display: 'flex', flexDirection: isGrid || isHorizontal ? 'row' : 'column', flexWrap: isGrid ? 'wrap' : 'nowrap', gap: `${el.gap}mm`, padding: '2mm', alignItems: 'flex-start' }}>
        {Array.from({ length: previewCount }, (_, i) => (
          <ItemCard
            key={i}
            fields={el.fields}
            itemWidth={el.itemWidth}
            itemHeight={el.itemHeight}
            borderStyle={borderStyle}
            borderRadius={borderRadius}
            background={el.itemBackground}
            opacity={i === 0 ? 1 : i === 1 ? 0.7 : 0.45}
          />
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '5mm', background: 'linear-gradient(to bottom, transparent, rgba(237,233,254,0.8))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '0.5mm', color: '#7c3aed', fontSize: '2.2mm', fontWeight: 'bold' }}>
        ↻ {el.maxItems > 0 ? `最大 ${el.maxItems} 件` : 'レコード数分 繰り返し'} ({el.layout === 'grid' ? `${el.gridColumns}列グリッド` : el.layout === 'horizontal' ? '横並び' : '縦並び'})
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live renderer
// ---------------------------------------------------------------------------

function RepeatingListLiveRenderer({
  element: el,
  records,
}: {
  element: RepeatingListElement
  records: Record<string, unknown>[]
}) {
  const limited = el.maxItems > 0 ? records.slice(0, el.maxItems) : records
  const bw = `${el.borderWidth ?? 0.3}mm`
  const borderStyle = el.borderColor ? `${bw} solid ${el.borderColor}` : 'none'
  const borderRadius = el.borderRadius ? `${el.borderRadius}mm` : undefined
  const isGrid = el.layout === 'grid'
  const isHorizontal = el.layout === 'horizontal'

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {limited.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '2.8mm' }}>
          データなし
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: isGrid || isHorizontal ? 'row' : 'column', flexWrap: isGrid ? 'wrap' : 'nowrap', gap: `${el.gap}mm`, padding: '2mm', alignItems: 'flex-start' }}>
          {limited.map((record, i) => (
            <ItemCard
              key={i}
              fields={el.fields}
              record={record}
              itemWidth={el.itemWidth}
              itemHeight={el.itemHeight}
              borderStyle={borderStyle}
              borderRadius={borderRadius}
              background={el.itemBackground}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

interface Props {
  element: RepeatingListElement
  /** Live Preview 時に渡す配列データ。undefined = デザインプレビュー表示 */
  records?: Record<string, unknown>[]
}

export const RepeatingListRenderer = memo(function RepeatingListRenderer({ element, records }: Props) {
  if (records === undefined) {
    return <RepeatingListDesignPreview element={element} />
  }
  return <RepeatingListLiveRenderer element={element} records={records} />
})
