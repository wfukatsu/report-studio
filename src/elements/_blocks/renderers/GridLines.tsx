import { memo } from 'react'
import { DEFAULT_BORDER_WIDTH } from '../constants'

interface GridLinesProps {
  /** Number of grid columns */
  count: number
  /** Line color */
  lineColor: string
  /** Line width in mm */
  lineWidth?: number
  /** Show outer border (default: true) */
  showOuterBorder?: boolean
}

/**
 * CSS border-based grid lines overlay.
 * Uses flexbox + border-right instead of SVG for html2canvas compatibility.
 */
export const GridLines = memo(function GridLines({
  count,
  lineColor,
  lineWidth = DEFAULT_BORDER_WIDTH,
  showOuterBorder = true,
}: GridLinesProps) {
  if (count <= 0) return null

  const borderStr = `${lineWidth}mm solid ${lineColor}`

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        border: showOuterBorder ? borderStr : undefined,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRight: i < count - 1 ? borderStr : undefined,
          }}
        />
      ))}
    </div>
  )
})
