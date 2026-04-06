import { memo } from 'react'
import type { DataFieldElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { applyFormat } from '@/lib/numberFormatter'

interface Props {
  element: DataFieldElement
  data?: Record<string, unknown>
}

export const DataFieldRenderer = memo(function DataFieldRenderer({ element: el, data = {} }: Props) {
  const style = el.style
  const raw = resolveField(data, el.fieldKey)
  let displayValue: string
  if (raw === undefined || raw === null) {
    displayValue = el.fallbackText ?? ''
  } else if (el.format) {
    displayValue = applyFormat(raw, el.format)
  } else {
    displayValue = String(raw)
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
        fontWeight: style.fontWeight ?? 'normal',
        color: style.color ?? '#000000',
        textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
        fontFamily: style.fontFamily,
        writingMode: (style.writingMode ?? 'horizontal-tb') as React.CSSProperties['writingMode'],
        overflow: 'hidden',
      }}
    >
      {displayValue || (
        <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
          {el.label ?? el.fieldKey}
        </span>
      )}
    </div>
  )
})
