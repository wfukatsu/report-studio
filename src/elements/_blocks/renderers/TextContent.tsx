import { memo } from 'react'
import type { TextStyle } from '@/types'
import { toFlexAlign } from '@/elements/_base/styleUtils'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, DEFAULT_FURIGANA_SCALE } from '../constants'

interface TextContentProps {
  text: string
  style: TextStyle
  furigana?: string
  furiganaScale?: number
}

export const TextContent = memo(function TextContent({
  text,
  style,
  furigana,
  furiganaScale = DEFAULT_FURIGANA_SCALE,
}: TextContentProps) {
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
          fontSize: `${style.fontSize ?? DEFAULT_FONT_SIZE}mm`,
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          textDecoration: style.textDecoration ?? 'none',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: style.fontFamily,
          textAlign: style.textAlign ?? 'left',
          textAlignLast: style.textAlign === 'justify' ? 'justify' : undefined,
          letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
          lineHeight: style.lineHeight ?? DEFAULT_LINE_HEIGHT,
          paddingTop: style.paddingTop != null ? `${style.paddingTop}mm` : undefined,
          paddingRight: style.paddingRight != null ? `${style.paddingRight}mm` : undefined,
          paddingBottom: style.paddingBottom != null ? `${style.paddingBottom}mm` : undefined,
          paddingLeft: style.paddingLeft != null ? `${style.paddingLeft}mm` : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: isVertical ? 'break-all' : 'break-word',
          alignSelf: 'stretch',
        }}
      >
        {furigana ? (
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <span
              style={{
                position: 'absolute',
                top: isVertical ? undefined : `-${furiganaScale * 1.2}em`,
                right: isVertical ? `-${furiganaScale * 1.2}em` : undefined,
                fontSize: `${furiganaScale * 100}%`,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {furigana}
            </span>
            {text}
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  )
})
