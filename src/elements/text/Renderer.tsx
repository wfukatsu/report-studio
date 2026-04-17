import { memo } from 'react'
import type { TextElement, TextStyle } from '@/types'
import { interpolate } from '@/lib/dataBinding'
<<<<<<< HEAD
import { resolveStyle } from '@/lib/styleUtils'
=======
>>>>>>> feat/formtable-excel-editing
import { TextContent } from '@/elements/_blocks/renderers/TextContent'

interface Props {
  element: TextElement
  data?: Record<string, unknown>
  /** Template-level default style (passed from ElementRenderer — one subscription). */
  defaultStyle?: TextStyle
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {}, defaultStyle }: Props) {
  const content = interpolate(el.content, data)
<<<<<<< HEAD
  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})
=======
>>>>>>> feat/formtable-excel-editing

  return (
    <TextContent
      text={content}
<<<<<<< HEAD
      style={resolvedStyle}
=======
      style={el.style}
>>>>>>> feat/formtable-excel-editing
      furigana={el.furigana}
      furiganaScale={el.furiganaScale}
    />
  )
})
