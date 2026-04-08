import { memo } from 'react'
import type { TextElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'
import { toFlexAlign } from '@/elements/_base/styleUtils'

interface Props {
  element: TextElement
  data?: Record<string, unknown>
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {} }: Props) {
  const content = interpolate(el.content, data)
  const style = el.style
  const isVertical = style.writingMode === 'vertical-rl'

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
      }}
    >
      <div
        style={{
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          textDecoration: style.textDecoration ?? 'none',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: style.fontFamily,
          textAlign: style.textAlign ?? 'left',
          textAlignLast: style.textAlign === 'justify' ? 'justify' : undefined,
          letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
          lineHeight: style.lineHeight ?? 1.4,
          paddingTop: style.paddingTop != null ? `${style.paddingTop}mm` : undefined,
          paddingRight: style.paddingRight != null ? `${style.paddingRight}mm` : undefined,
          paddingBottom: style.paddingBottom != null ? `${style.paddingBottom}mm` : undefined,
          paddingLeft: style.paddingLeft != null ? `${style.paddingLeft}mm` : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: isVertical ? 'break-all' : 'break-word',
          alignSelf: 'stretch',
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
