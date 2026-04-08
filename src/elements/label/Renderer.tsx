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

  // 横揃え = 常に横方向、縦揃え = 常に縦方向（writing-mode によるスワップなし）
  const hAlign = toFlexAlign(style.textAlign, 'flex-start')
  const vAlign = toFlexAlign(style.verticalAlign, 'flex-start')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: hAlign,
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
          whiteSpace: 'pre-wrap',
          wordBreak: isVertical ? ('break-all' as const) : undefined,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {el.text}
      </span>
    </div>
  )
})
