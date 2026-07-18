import { memo } from 'react'
import type { TextElement, TextStyle } from '@/types'
import { interpolate } from '@/lib/dataBinding'
import { resolveStyle } from '@/lib/styleUtils'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { SAMPLE_VALUE_HINT_STYLE } from '@/elements/_blocks/constants'

/** Detects {{...}} data-binding tokens in raw text content. */
const HAS_TEMPLATE = /\{\{[^}]+\}\}/

interface Props {
  element: TextElement
  data?: Record<string, unknown>
  /** Template-level default style (passed from ElementRenderer — one subscription). */
  defaultStyle?: TextStyle
  /** Design mode (!readonly): mark data-driven text with a subtle sample hint. */
  sampleHint?: boolean
}

export const TextRenderer = memo(function TextRenderer({ element: el, data = {}, defaultStyle, sampleHint }: Props) {
  const content = interpolate(el.content, data)
  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})

  const textContent = (
    <TextContent
      text={content}
      style={resolvedStyle}
      furigana={el.furigana}
      furiganaScale={el.furiganaScale}
    />
  )

  // Design mode: only text that actually interpolates a {{token}} into a non-empty value
  // is data-driven; static literal text keeps its plain appearance. The dotted underline
  // is design-only (sampleHint is false in preview / export).
  if (sampleHint && content && HAS_TEMPLATE.test(el.content)) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {textContent}
        <span style={SAMPLE_VALUE_HINT_STYLE} aria-hidden />
      </div>
    )
  }

  return textContent
})
