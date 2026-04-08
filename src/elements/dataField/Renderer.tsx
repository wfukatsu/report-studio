import { memo } from 'react'
import type { DataFieldElement } from '@/types'
import { useDataResolver } from '@/elements/_blocks/hooks/useDataResolver'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'

interface Props {
  element: DataFieldElement
  data?: Record<string, unknown>
}

export const DataFieldRenderer = memo(function DataFieldRenderer({ element: el, data = {} }: Props) {
  const { resolved } = useDataResolver(el.fieldKey, data, {
    format: el.format,
    fallbackText: el.fallbackText,
  })

  if (!resolved) {
    return (
      <TextContent
        text={el.label ?? el.fieldKey}
        style={{ ...el.style, color: '#9ca3af', fontStyle: 'italic' }}
      />
    )
  }

  return <TextContent text={resolved} style={el.style} />
})
