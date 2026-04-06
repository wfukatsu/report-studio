import { memo } from 'react'
import type { TextElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'

interface Props {
  element: TextElement
  data?: Record<string, unknown>
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {} }: Props) {
  const content = interpolate(el.content, data)
  const style = el.style
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
        fontWeight: style.fontWeight ?? 'normal',
        fontStyle: style.fontStyle ?? 'normal',
        textDecoration: style.textDecoration ?? 'none',
        color: style.color ?? '#000000',
        backgroundColor: style.backgroundColor ?? 'transparent',
        textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
        lineHeight: style.lineHeight ?? 1.4,
        writingMode: (style.writingMode ?? 'horizontal-tb') as React.CSSProperties['writingMode'],
        paddingTop: style.paddingTop != null ? `${style.paddingTop}mm` : undefined,
        paddingRight: style.paddingRight != null ? `${style.paddingRight}mm` : undefined,
        paddingBottom: style.paddingBottom != null ? `${style.paddingBottom}mm` : undefined,
        paddingLeft: style.paddingLeft != null ? `${style.paddingLeft}mm` : undefined,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
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
  )
})
