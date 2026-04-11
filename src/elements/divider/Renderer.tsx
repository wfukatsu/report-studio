import { memo } from 'react'
import type { DividerElement } from '@/types'

interface Props {
  element: DividerElement
}

const DASH_MAP: Record<string, string> = {
  solid: 'none',
  dashed: '4mm 2mm',
  dotted: '1mm 1mm',
}

export const DividerRenderer = memo(function DividerRenderer({ element: el }: Props) {
  const isHorizontal = el.direction === 'horizontal'
  const dashArray = DASH_MAP[el.dashStyle] ?? 'none'

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${el.size.width} ${el.size.height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <line
        x1={0}
        y1={isHorizontal ? el.size.height / 2 : 0}
        x2={isHorizontal ? el.size.width : el.size.width / 2}
        y2={isHorizontal ? el.size.height / 2 : el.size.height}
        stroke={el.color}
        strokeWidth={`${el.thickness}mm`}
        strokeDasharray={dashArray}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
})
