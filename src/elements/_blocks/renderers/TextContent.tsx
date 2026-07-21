import { memo, useRef, useState, useLayoutEffect } from 'react'
import type { TextStyle } from '@/types'
import { toFlexAlign } from '@/elements/_base/styleUtils'
import { resolveFontFamily } from '@/lib/styleUtils'
import {
  DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, DEFAULT_FURIGANA_SCALE,
  FURIGANA_OFFSET_MULTIPLIER, MIN_SHRINK_FONT_SIZE_PT,
  SHRINK_MAX_ITERATIONS, SHRINK_CONVERGENCE_PT, OVERFLOW_TOLERANCE_PX,
} from '../constants'

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
  const baseFontSize = style.fontSize ?? DEFAULT_FONT_SIZE
  const textFit = style.textFit

  // --- shrinkText: progressively reduce font size until content fits ---
  const containerRef = useRef<HTMLDivElement>(null)
  const [shrunkFontSize, setShrunkFontSize] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (textFit !== 'shrinkText') {
      setShrunkFontSize(null)
      return
    }
    const container = containerRef.current
    if (!container) return

    const inner = container.firstElementChild as HTMLElement | null
    if (!inner) return

    // Reset to base size for measurement
    inner.style.fontSize = `${baseFontSize}pt`

    const overflowsH = container.scrollHeight > container.clientHeight + OVERFLOW_TOLERANCE_PX
    const overflowsW = container.scrollWidth > container.clientWidth + OVERFLOW_TOLERANCE_PX
    if (!overflowsH && !overflowsW) {
      setShrunkFontSize(null)
      return
    }

    // Binary search for the largest font size that fits
    let lo = MIN_SHRINK_FONT_SIZE_PT
    let hi = baseFontSize

    for (let i = 0; i < SHRINK_MAX_ITERATIONS && hi - lo > SHRINK_CONVERGENCE_PT; i++) {
      const mid = (lo + hi) / 2
      inner.style.fontSize = `${mid}pt`
      const fits =
        container.scrollHeight <= container.clientHeight + OVERFLOW_TOLERANCE_PX &&
        container.scrollWidth <= container.clientWidth + OVERFLOW_TOLERANCE_PX
      if (fits) {
        lo = mid
      } else {
        hi = mid
      }
    }

    inner.style.fontSize = `${lo}pt`
    setShrunkFontSize(lo)
  }, [textFit, baseFontSize, text, style.lineHeight, style.letterSpacing, style.fontFamily, style.fontWeight, style.writingMode, style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft])

  const effectiveFontSize = textFit === 'shrinkText' && shrunkFontSize != null
    ? shrunkFontSize
    : baseFontSize

  const isExpand = textFit === 'expandFrame'

  return (
    <div
      ref={textFit === 'shrinkText' ? containerRef : undefined}
      style={{
        width: '100%',
        height: isExpand ? 'auto' : '100%',
        minHeight: isExpand ? '100%' : undefined,
        display: 'flex',
        flexDirection: 'column',
        writingMode: isVertical ? 'vertical-rl' : undefined,
        justifyContent: toFlexAlign(style.verticalAlign),
        overflow: isExpand ? 'visible' : 'hidden',
      }}
    >
      <div
        style={{
          fontSize: `${effectiveFontSize}pt`,
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          textDecoration: style.textDecoration ?? 'none',
          color: style.color ?? '#000000',
          backgroundColor: style.backgroundColor ?? 'transparent',
          fontFamily: resolveFontFamily(style.fontFamily),
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
                top: isVertical ? undefined : `-${furiganaScale * FURIGANA_OFFSET_MULTIPLIER}em`,
                right: isVertical ? `-${furiganaScale * FURIGANA_OFFSET_MULTIPLIER}em` : undefined,
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
