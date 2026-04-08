import { memo } from 'react'
import type { LabelElement } from '@/types'

interface Props {
  element: LabelElement
}

function toFlexAlign(value: string | undefined): string {
  if (value === 'center' || value === 'middle') return 'center'
  if (value === 'right' || value === 'bottom' || value === 'end') return 'flex-end'
  return 'flex-start'
}

export const LabelRenderer = memo(function LabelRenderer({ element: el }: Props) {
  const style = el.style
  const isVertical = style.writingMode === 'vertical-rl'

  // writing-mode を外側 flex コンテナに配置。
  // CSS 論理プロパティにより軸変換が自動で行われる:
  //   横揃え → text-align（常にインライン方向）
  //   縦揃え → justify-content（常にブロック方向）
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        writingMode: isVertical ? 'vertical-rl' : undefined,
        justifyContent: toFlexAlign(style.verticalAlign),
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: style.fontFamily,
          textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
          textAlignLast: style.textAlign === 'justify' ? 'justify' : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: isVertical ? ('break-all' as const) : 'break-word',
          alignSelf: 'stretch',
        }}
      >
        {el.text}
      </div>
    </div>
  )
})
