import { memo } from 'react'
import type { LabelElement } from '@/types'

interface Props {
  element: LabelElement
}

export const LabelRenderer = memo(function LabelRenderer({ element: el }: Props) {
  const style = el.style
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
        fontWeight: style.fontWeight ?? 'normal',
        fontStyle: style.fontStyle ?? 'normal',
        color: style.color ?? '#000000',
        backgroundColor: style.backgroundColor ?? 'transparent',
        textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
        fontFamily: style.fontFamily,
        writingMode: (style.writingMode ?? 'horizontal-tb') as React.CSSProperties['writingMode'],
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {el.text}
    </div>
  )
})
