import { memo } from 'react'
import type { DataFieldElement, TextStyle } from '@/types'
import { useDataResolver } from '@/elements/_blocks/hooks/useDataResolver'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { SAMPLE_VALUE_HINT_STYLE } from '@/elements/_blocks/constants'
import { resolveStyle } from '@/lib/styleUtils'

interface Props {
  element: DataFieldElement
  data?: Record<string, unknown>
  defaultStyle?: TextStyle
  /** Design mode (!readonly): mark data-resolved values with a subtle sample hint. */
  sampleHint?: boolean
}

export const DataFieldRenderer = memo(function DataFieldRenderer({ element: el, data = {}, defaultStyle, sampleHint }: Props) {
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

  // Design mode: the value comes from sample / computed data and will change with the
  // real record. A non-destructive dotted underline signals that without altering the
  // exported / preview output (sampleHint is false in readonly mode).
  if (sampleHint) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <TextContent text={resolved} style={resolvedStyle} />
        <span style={SAMPLE_VALUE_HINT_STYLE} aria-hidden />
      </div>
    )
  }

  return <TextContent text={resolved} style={resolvedStyle} />
})
