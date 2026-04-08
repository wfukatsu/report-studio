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

/** 縦書き時: verticalAlign(top/middle/bottom) → text-align(left/center/right) へマッピング */
function vAlignToTextAlign(va: string | undefined): string {
  if (va === 'middle') return 'center'
  if (va === 'bottom') return 'right'
  return 'left' // top or default
}

export const LabelRenderer = memo(function LabelRenderer({ element: el }: Props) {
  const style = el.style
  const isVertical = style.writingMode === 'vertical-rl'

  // 横書き: flex-direction: column, justify-content で縦揃え, text-align で横揃え
  // 縦書き: flex-direction: row,    justify-content で横揃え, text-align で縦揃え（軸変換）
  const outerJustify = isVertical
    ? toFlexAlign(style.textAlign, 'flex-start')   // 横揃え → 水平配置
    : toFlexAlign(style.verticalAlign, 'flex-start') // 縦揃え → 垂直配置

  const innerTextAlign = isVertical
    ? vAlignToTextAlign(style.verticalAlign) // 縦揃え → inline方向 (top→left, middle→center, bottom→right)
    : (style.textAlign ?? 'left')           // 横揃え → そのまま text-align

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        justifyContent: outerJustify,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          writingMode: isVertical ? 'vertical-rl' : undefined,
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: style.fontFamily,
          textAlign: innerTextAlign as React.CSSProperties['textAlign'],
          textAlignLast: !isVertical && style.textAlign === 'justify' ? 'justify' : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: isVertical ? ('break-all' as const) : 'break-word',
          width: isVertical ? undefined : '100%',
          height: isVertical ? '100%' : undefined,
        }}
      >
        {el.text}
      </div>
    </div>
  )
})
