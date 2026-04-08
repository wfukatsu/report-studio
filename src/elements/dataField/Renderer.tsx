import { memo } from 'react'
import type { DataFieldElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { applyFormat } from '@/lib/numberFormatter'

interface Props {
  element: DataFieldElement
  data?: Record<string, unknown>
}

function toFlexAlign(value: string | undefined, fallback: string): string {
  if (value === 'center' || value === 'middle') return 'center'
  if (value === 'right' || value === 'bottom' || value === 'end') return 'flex-end'
  return fallback
}

export const DataFieldRenderer = memo(function DataFieldRenderer({ element: el, data = {} }: Props) {
  const style = el.style
  const isVertical = style.writingMode === 'vertical-rl'
  const raw = resolveField(data, el.fieldKey)
  let displayValue: string
  if (raw === undefined || raw === null) {
    displayValue = el.fallbackText ?? ''
  } else if (el.format) {
    displayValue = applyFormat(raw, el.format)
  } else {
    displayValue = String(raw)
  }

  const vAlign = toFlexAlign(style.verticalAlign, 'flex-start')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: vAlign,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          writingMode: isVertical ? 'vertical-rl' : undefined,
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3.5mm',
          fontWeight: style.fontWeight ?? 'normal',
          color: style.color ?? '#000000',
          fontFamily: style.fontFamily,
          textAlign: (style.textAlign ?? 'left') as React.CSSProperties['textAlign'],
          width: isVertical ? undefined : '100%',
          height: isVertical ? '100%' : undefined,
        }}
      >
        {displayValue || (
          <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
            {el.label ?? el.fieldKey}
          </span>
        )}
      </div>
    </div>
  )
})
