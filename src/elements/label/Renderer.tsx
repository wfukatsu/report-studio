import { memo } from 'react'
import type { LabelElement } from '@/types'

interface Props {
  element: LabelElement
}

function toFlexAlign(value: string | undefined, fallback: string): string {
  if (value === 'center' || value === 'middle') return 'center'
  if (value === 'right' || value === 'bottom' || value === 'end') return 'flex-end'
  return fallback
}

export const LabelRenderer = memo(function LabelRenderer({ element: el }: Props) {
  const style = el.style
  const isVertical = style.writingMode === 'vertical-rl'
  const isJustify = style.textAlign === 'justify'

  const hAlign = toFlexAlign(style.textAlign, 'flex-start')
  const vAlign = toFlexAlign(style.verticalAlign, 'flex-start')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: isJustify ? 'flex-start' : hAlign,
        alignItems: vAlign,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          writingMode: isVertical ? 'vertical-rl' : undefined,
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: style.fontFamily,
          textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
          whiteSpace: 'pre-wrap',
          wordBreak: isVertical ? ('break-all' as const) : undefined,
          width: isJustify ? '100%' : undefined,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {el.text}
      </span>
    </div>
  )
})
