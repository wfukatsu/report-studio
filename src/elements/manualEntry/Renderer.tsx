import { memo } from 'react'
import type { ManualEntryField } from '@/types'
import { resolveField } from '@/lib/dataBinding'

interface Props {
  element: ManualEntryField
  data?: Record<string, unknown>
}

function InputArea({ el }: { el: ManualEntryField }) {
  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        borderBottom: el.displayMode === 'line' ? `0.3mm solid ${el.lineColor}` : undefined,
        border: el.displayMode === 'box' ? `0.3mm solid ${el.lineColor}` : undefined,
        overflow: 'hidden',
      }}
    >
      {el.displayMode === 'grid' && (el.gridCount ?? 0) > 0 && (
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', top: 0, left: 0 }}
          preserveAspectRatio="none"
        >
          <rect
            x="0.15mm"
            y="0.15mm"
            width="calc(100% - 0.3mm)"
            height="calc(100% - 0.3mm)"
            fill="none"
            stroke={el.lineColor}
            strokeWidth="0.3mm"
          />
          {Array.from({ length: (el.gridCount ?? 1) - 1 }, (_, i) => (
            <line
              key={i}
              x1={`${((i + 1) / (el.gridCount ?? 1)) * 100}%`}
              y1="0"
              x2={`${((i + 1) / (el.gridCount ?? 1)) * 100}%`}
              y2="100%"
              stroke={el.lineColor}
              strokeWidth="0.3mm"
            />
          ))}
        </svg>
      )}
      {el.placeholder && (
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: el.style.fontSize ? `${el.style.fontSize}mm` : '3.5mm',
            color: el.style.color ?? '#000000',
            opacity: 0.4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {el.placeholder}
        </span>
      )}
    </div>
  )
}

export const ManualEntryRenderer = memo(function ManualEntryRenderer({ element: el, data }: Props) {
  if (el.furiganaEnabled) {
    const ratio = el.furiganaRatio ?? 0.35
    const furiganaValue = el.furiganaDataSource
      ? resolveField(data ?? {}, el.furiganaDataSource)
      : ''

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none' }}>
        {/* フリガナゾーン */}
        <div style={{ height: `${ratio * 100}%`, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '2.2mm', whiteSpace: 'nowrap' }}>フリガナ</span>
          <div
            style={{
              flex: 1,
              position: 'relative',
              borderBottom: `0.3mm solid ${el.lineColor}`,
              overflow: 'hidden',
            }}
          >
            {furiganaValue && (
              <span style={{ fontSize: '2.8mm', color: el.style.color ?? '#000000' }}>
                {furiganaValue}
              </span>
            )}
          </div>
        </div>
        {/* メインゾーン */}
        <div style={{ flex: 1, display: 'flex', flexDirection: el.labelPosition === 'left' ? 'row' : 'column' }}>
          {el.labelPosition !== 'none' && (
            <span style={{ fontSize: '2.8mm', whiteSpace: 'nowrap', paddingRight: '1mm' }}>
              {el.label}
            </span>
          )}
          <InputArea el={el} />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: el.labelPosition === 'left' ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {el.labelPosition !== 'none' && (
        <span style={{ fontSize: '2.8mm', whiteSpace: 'nowrap', paddingRight: '1mm' }}>
          {el.label}
        </span>
      )}
      <InputArea el={el} />
    </div>
  )
})
