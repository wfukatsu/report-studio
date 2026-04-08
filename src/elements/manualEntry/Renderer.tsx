import { memo } from 'react'
import type { ManualEntryField } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { GridLines } from '@/elements/_blocks/renderers/GridLines'
import { DEFAULT_FONT_SIZE, DEFAULT_BORDER_WIDTH } from '@/elements/_blocks/constants'

interface Props {
  element: ManualEntryField
  data?: Record<string, unknown>
}

function InputArea({ el }: { el: ManualEntryField }) {
  const borderStr = `${DEFAULT_BORDER_WIDTH}mm solid ${el.lineColor}`

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        borderBottom: el.displayMode === 'line' ? borderStr : undefined,
        border: el.displayMode === 'box' ? borderStr : undefined,
        overflow: 'hidden',
      }}
    >
      {el.displayMode === 'grid' && (el.gridCount ?? 0) > 0 && (
        <GridLines
          count={el.gridCount ?? 1}
          lineColor={el.lineColor}
          lineWidth={DEFAULT_BORDER_WIDTH}
        />
      )}
      {el.placeholder && (
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: el.style.fontSize ? `${el.style.fontSize}mm` : `${DEFAULT_FONT_SIZE}mm`,
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
              borderBottom: `${DEFAULT_BORDER_WIDTH}mm solid ${el.lineColor}`,
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
