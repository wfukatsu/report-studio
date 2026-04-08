import { memo } from 'react'
import type { EraSelectElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { DEFAULT_ERAS } from './constants'
import { MM_TO_PX } from '@/elements/_blocks/constants'

interface Props {
  element: EraSelectElement
  data?: Record<string, unknown>
}

export const EraSelectRenderer = memo(function EraSelectRenderer({ element: el, data = {} }: Props) {
  const selected = el.dataSource ? resolveField(data, el.dataSource) : ''
  const eras = el.eras ?? DEFAULT_ERAS
  const layout = el.layout ?? 'column'
  const count = Math.max(eras.length, 1)

  // フォントサイズ: レイアウトと元号数に応じて自動計算
  // 比率: row=0.5, grid=0.6, column=0.75 — 要素サイズに対する比率
  const ROW_RATIO = 0.5
  const GRID_RATIO = 0.6
  const COLUMN_RATIO = 0.75
  const MIN_FONT_SIZE = 2.0 // mm

  const rawFontSize = layout === 'row'
    ? (el.size.width / count) * ROW_RATIO
    : layout === 'grid-2col'
      ? (el.size.height / Math.ceil(count / 2)) * GRID_RATIO
      : (el.size.height / count) * COLUMN_RATIO
  const fontSize = `${Math.max(rawFontSize, MIN_FONT_SIZE)}mm`

  const isGrid = layout === 'grid-2col'

  const containerStyle: React.CSSProperties = isGrid
    ? {
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignContent: 'space-around',
        justifyItems: 'start',
      }
    : {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: layout === 'row' ? 'row' : 'column',
        justifyContent: 'space-around',
        alignItems: layout === 'row' ? 'center' : undefined,
      }

  return (
    <div style={containerStyle}>
      {eras.map((era) => (
        <div
          key={era}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            fontSize,
            lineHeight: 1,
            gap: '0.3mm',
          }}
        >
          <span>{selected === era ? '●' : '○'}</span>
          <span>{era}</span>
        </div>
      ))}
    </div>
  )
})
