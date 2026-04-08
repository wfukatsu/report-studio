import { memo } from 'react'
import type { EraSelectElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'

const DEFAULT_ERAS = ['明', '大', '昭', '平', '令']

interface Props {
  element: EraSelectElement
  data?: Record<string, unknown>
}

export const EraSelectRenderer = memo(function EraSelectRenderer({ element: el, data = {} }: Props) {
  const selected = el.dataSource ? resolveField(data, el.dataSource) : ''
  const eras = el.eras ?? DEFAULT_ERAS
  const layout = el.layout ?? 'column'
  const count = eras.length

  // フォントサイズ: レイアウトと元号数に応じて自動計算
  const rawFontSize = layout === 'row'
    ? (el.size.width / count) * 0.5
    : layout === 'grid-2col'
      ? (el.size.height / Math.ceil(count / 2)) * 0.6
      : (el.size.height / count) * 0.75
  const fontSize = `${Math.max(rawFontSize, 2.0)}mm`

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
