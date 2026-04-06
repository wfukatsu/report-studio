import { memo } from 'react'
import type { ShapeElement } from '@/types'

const DASH_MAP: Record<string, string> = { solid: 'none', dashed: '6 3', dotted: '2 2' }

interface Props {
  element: ShapeElement
}

export const ShapeRenderer = memo(function ShapeRenderer({ element: el }: Props) {
  const dash = DASH_MAP[el.strokeDash ?? 'solid'] ?? 'none'
  if (el.shape === 'line') {
    return (
      <svg width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke={el.stroke ?? '#000000'} strokeWidth={el.strokeWidth ?? 0.3} strokeDasharray={dash} />
      </svg>
    )
  }
  if (el.shape === 'circle') {
    return (
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <ellipse cx="50%" cy="50%" rx="49%" ry="49%" fill={el.fill ?? 'transparent'} stroke={el.stroke ?? '#000000'} strokeWidth={el.strokeWidth ?? 0.3} strokeDasharray={dash} />
      </svg>
    )
  }
  const rx = el.borderRadius ? `${el.borderRadius}mm` : undefined
  return (
    <svg width="100%" height="100%" style={{ display: 'block' }}>
      <rect x="1%" y="1%" width="98%" height="98%" rx={rx} ry={rx} fill={el.fill ?? 'transparent'} stroke={el.stroke ?? '#000000'} strokeWidth={el.strokeWidth ?? 0.3} strokeDasharray={dash} />
    </svg>
  )
})
