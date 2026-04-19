import { memo } from 'react'
import type { TextElement, TextStyle } from '@/types'
import { interpolate } from '@/lib/dataBinding'
import { resolveStyle } from '@/lib/styleUtils'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'

interface Props {
  element: TextElement
  data?: Record<string, unknown>
  /** Template-level default style (passed from ElementRenderer — one subscription). */
  defaultStyle?: TextStyle
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {}, defaultStyle }: Props) {
  const content = interpolate(el.content, data)
  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})

  return (
    <TextContent
      text={content}
      style={resolvedStyle}
      furigana={el.furigana}
      furiganaScale={el.furiganaScale}
    />
  )
})
