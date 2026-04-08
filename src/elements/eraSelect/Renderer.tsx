import { memo } from 'react'
import type { EraSelectElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'

const ERAS = ['明', '大', '昭', '平', '令'] as const

interface Props {
  element: EraSelectElement
  data?: Record<string, unknown>
}

export const EraSelectRenderer = memo(function EraSelectRenderer({ element: el, data = {} }: Props) {
  const selected = el.dataSource ? resolveField(data, el.dataSource) : ''
  const fontSize = `${Math.max((el.size.height / 5) * 0.75, 2.0)}mm`

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
      }}
    >
      {ERAS.map((era) => (
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
