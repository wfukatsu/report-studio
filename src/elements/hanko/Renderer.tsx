import { memo } from 'react'
import type { HankoElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'

interface Props {
  element: HankoElement
  data?: Record<string, unknown>
}

export const HankoRenderer = memo(function HankoRenderer({ element: el, data = {} }: Props) {
  const text = el.binding ? String(resolveField(data, el.binding) ?? el.text) : el.text
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible' }}>
      {el.shape === 'circle' ? (
        <>
          <circle cx="50" cy="50" r="46" fill="none" stroke={el.borderColor} strokeWidth={el.doubleBorder ? 3 : 2} />
          {el.doubleBorder && <circle cx="50" cy="50" r="40" fill="none" stroke={el.borderColor} strokeWidth={1.5} />}
        </>
      ) : (
        <>
          <rect x="4" y="4" width="92" height="92" fill="none" stroke={el.borderColor} strokeWidth={el.doubleBorder ? 3 : 2} />
          {el.doubleBorder && <rect x="10" y="10" width="80" height="80" fill="none" stroke={el.borderColor} strokeWidth={1.5} />}
        </>
      )}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill={el.textColor} fontSize={el.fontSize * 3.78} style={{ writingMode: el.writingMode as React.CSSProperties['writingMode'] }}>
        {text}
      </text>
    </svg>
  )
})
