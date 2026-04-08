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

  // Flexbox alignment mapping:
  // 横書き: justify-content = textAlign(横), align-items = verticalAlign(縦)
  // 縦書き: justify-content = verticalAlign(縦), align-items = textAlign(横)
  const hAlign = toFlexAlign(style.textAlign, 'flex-start')
  const vAlign = toFlexAlign(style.verticalAlign, 'flex-start')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        writingMode: (style.writingMode ?? 'horizontal-tb') as React.CSSProperties['writingMode'],
        justifyContent: isVertical ? vAlign : hAlign,
        alignItems: isVertical ? hAlign : vAlign,
        fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
        fontWeight: style.fontWeight ?? 'normal',
        fontStyle: style.fontStyle ?? 'normal',
        color: style.color ?? '#000000',
        backgroundColor: style.backgroundColor ?? 'transparent',
        fontFamily: style.fontFamily,
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        wordBreak: isVertical ? ('break-all' as const) : undefined,
        userSelect: 'none',
      }}
    >
      {el.text}
    </div>
  )
})
