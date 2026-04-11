import { memo } from 'react'
import type { LabelElement } from '@/types'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'

interface Props {
  element: LabelElement
}

/**
 * LabelRenderer — renders legacy `LabelElement` using the shared `TextContent` block.
 *
 * The outer `userSelect: none` wrapper preserves drag UX on the canvas (label
 * elements should not be selectable as text when the user is dragging).
 * `TextContent` handles font, size, vertical/horizontal alignment, writing mode, etc.
 */
export const LabelRenderer = memo(function LabelRenderer({ element: el }: Props) {
  return (
    <div style={{ width: '100%', height: '100%', userSelect: 'none' }}>
      <TextContent text={el.text} style={el.style} />
    </div>
  )
})
