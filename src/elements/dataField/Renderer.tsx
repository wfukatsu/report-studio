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

function vAlignToTextAlign(va: string | undefined): string {
  if (va === 'middle') return 'center'
  if (va === 'bottom') return 'right'
  return 'left'
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

  const outerJustify = isVertical
    ? toFlexAlign(style.textAlign, 'flex-start')
    : toFlexAlign(style.verticalAlign, 'flex-start')

  const innerTextAlign = isVertical
    ? vAlignToTextAlign(style.verticalAlign)
    : (style.textAlign ?? 'left')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        justifyContent: outerJustify,
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
          textAlign: innerTextAlign as React.CSSProperties['textAlign'],
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
