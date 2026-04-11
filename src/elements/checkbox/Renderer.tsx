import { memo } from 'react'
import type { CheckboxElement, CheckboxLabelPosition } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { DEFAULT_BORDER_WIDTH } from '@/elements/_blocks/constants'

interface Props {
  element: CheckboxElement
  data?: Record<string, unknown>
}

function getFlexDirection(pos: CheckboxLabelPosition): React.CSSProperties['flexDirection'] {
  switch (pos) {
    case 'left': return 'row-reverse'
    case 'top': return 'column-reverse'
    case 'bottom': return 'column'
    default: return 'row'
  }
}

export const CheckboxRenderer = memo(function CheckboxRenderer({ element: el, data = {} }: Props) {
  const isChecked = el.dataSource
    ? resolveField(data, el.dataSource) !== ''
    : el.checked

  const pos = el.labelPosition ?? 'right'
  const fontSize = `${el.size.height * 0.6}mm`

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: getFlexDirection(pos),
      alignItems: 'center',
      gap: '1mm',
    }}>
      <div
        style={{
          width: `${el.size.height}mm`,
          height: `${el.size.height}mm`,
          border: `${DEFAULT_BORDER_WIDTH}mm solid #000000`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          flexShrink: 0,
          boxSizing: 'border-box',
          ...el.style,
        }}
      >
        {isChecked && el.checkmark}
      </div>
      {el.label !== '' && (
        <span style={{ fontSize: '2.8mm', whiteSpace: 'nowrap' }}>
          {el.label}
        </span>
      )}
    </div>
  )
})
