import { memo } from 'react'
import type { DataFieldElement, TextStyle } from '@/types'
import { useDataResolver } from '@/elements/_blocks/hooks/useDataResolver'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'

interface Props {
  element: DataFieldElement
  data?: Record<string, unknown>
  defaultStyle?: TextStyle
}

export const DataFieldRenderer = memo(function DataFieldRenderer({ element: el, data = {}, defaultStyle }: Props) {
  const { resolved } = useDataResolver(el.fieldKey, data, {
    format: el.format,
    fallbackText: el.fallbackText,
  })
  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})

  if (!resolved) {
    return (
      <TextContent
        text={el.label ?? el.fieldKey}
        style={{ ...resolvedStyle, color: '#9ca3af', fontStyle: 'italic' }}
      />
    )
  }

  return <TextContent text={resolved} style={resolvedStyle} />
})
