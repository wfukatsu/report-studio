import { memo } from 'react'
import type { ManualEntryField } from '@/types'

interface Props {
  element: ManualEntryField
}

export const ManualEntryRenderer = memo(function ManualEntryRenderer({ element: el }: Props) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: el.labelPosition === 'left' ? 'row' : 'column', gap: '1mm' }}>
      {el.labelPosition !== 'none' && (
        <span style={{ fontSize: '2.8mm', color: '#4b5563', whiteSpace: 'nowrap', alignSelf: el.labelPosition === 'left' ? 'center' : undefined }}>
          {el.label}
        </span>
      )}
      <div style={{ flex: 1, position: 'relative', borderBottom: el.displayMode === 'line' ? `0.3mm solid ${el.lineColor}` : undefined, border: el.displayMode === 'box' ? `0.3mm solid ${el.lineColor}` : undefined, minHeight: '4mm' }}>
        {el.displayMode === 'grid' && el.gridCount && el.gridCount > 0 && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <rect x="0" y="0" width="100%" height="100%" fill="none" stroke={el.lineColor} strokeWidth="0.3" />
            {Array.from({ length: el.gridCount - 1 }, (_, i) => (
              <line key={i} x1={`${((i + 1) / el.gridCount!) * 100}%`} y1="0" x2={`${((i + 1) / el.gridCount!) * 100}%`} y2="100%" stroke={el.lineColor} strokeWidth="0.3" />
            ))}
          </svg>
        )}
        {el.placeholder && (
          <span style={{ position: 'absolute', top: '1mm', left: '2mm', fontSize: '2.5mm', color: '#d1d5db', pointerEvents: 'none' }}>
            {el.placeholder}
          </span>
        )}
      </div>
    </div>
  )
})
