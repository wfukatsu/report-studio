import { memo } from 'react'
import type { CheckboxElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'

interface Props {
  element: CheckboxElement
  data?: Record<string, unknown>
}

export const CheckboxRenderer = memo(function CheckboxRenderer({ element: el, data = {} }: Props) {
  const isChecked = el.dataSource
    ? resolveField(data, el.dataSource) !== ''
    : el.checked

  const fontSize = `${el.size.height * 0.6}mm`

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1mm' }}>
      <div
        style={{
          width: `${el.size.height}mm`,
          height: `${el.size.height}mm`,
          border: '0.3mm solid #000000',
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
