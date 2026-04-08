import { memo } from 'react'
import type { TextElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'

interface Props {
  element: TextElement
  data?: Record<string, unknown>
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {} }: Props) {
  const content = interpolate(el.content, data)

  return (
    <TextContent
      text={content}
      style={el.style}
      furigana={el.furigana}
      furiganaScale={el.furiganaScale}
    />
  )
})
