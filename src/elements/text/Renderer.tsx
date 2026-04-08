import { memo } from 'react'
import type { TextElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'

interface Props {
  element: TextElement
  data?: Record<string, unknown>
}

function toFlexAlign(value: string | undefined, fallback: string): string {
  if (value === 'center' || value === 'middle') return 'center'
  if (value === 'right' || value === 'bottom' || value === 'end') return 'flex-end'
  return fallback
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {} }: Props) {
  const content = interpolate(el.content, data)
  const style = el.style
  const isVertical = style.writingMode === 'vertical-rl'
  const vAlign = toFlexAlign(style.verticalAlign, 'flex-start')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: vAlign,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          writingMode: isVertical ? 'vertical-rl' : undefined,
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          textDecoration: style.textDecoration ?? 'none',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: style.fontFamily,
          textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
          textAlignLast: style.textAlign === 'justify' ? 'justify' : undefined,
          letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
          lineHeight: style.lineHeight ?? 1.4,
          paddingTop: style.paddingTop != null ? `${style.paddingTop}mm` : undefined,
          paddingRight: style.paddingRight != null ? `${style.paddingRight}mm` : undefined,
          paddingBottom: style.paddingBottom != null ? `${style.paddingBottom}mm` : undefined,
          paddingLeft: style.paddingLeft != null ? `${style.paddingLeft}mm` : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          width: isVertical ? undefined : '100%',
          height: isVertical ? '100%' : undefined,
        }}
      >
        {el.furigana ? (
          <ruby>
            {content}
            <rt style={{ fontSize: `${(el.furiganaScale ?? 0.5) * 100}%` }}>{el.furigana}</rt>
          </ruby>
        ) : (
          content
        )}
      </div>
    </div>
  )
})
