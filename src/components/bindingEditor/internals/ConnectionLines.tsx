/**
 * ConnectionLines — SVG overlay showing binding connections and drag rubber-band.
 *
 * Renders dashed lines between schema fields (left) and template elements (right),
 * plus a rubber-band line while dragging a field to connect.
 */

import { memo } from 'react'
import type { LinePos, DragState } from '../types'

interface ConnectionLinesProps {
  /** Pre-calculated line positions */
  readonly lines: readonly LinePos[]
  /** Current drag state (for rubber-band line) */
  readonly dragState: DragState | null
  /** Field DOM ref map for drag start point */
  readonly fieldRefs: React.RefObject<Map<string, HTMLElement | null>>
  /** Container ref for coordinate offset */
  readonly containerRef: React.RefObject<HTMLDivElement | null>
}

export const ConnectionLines = memo(function ConnectionLines({
  lines,
  dragState,
  fieldRefs,
  containerRef,
}: ConnectionLinesProps) {
  const containerRect = containerRef.current?.getBoundingClientRect()

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ zIndex: 10 }}
      aria-hidden="true"
    >
      {/* Existing connection lines */}
      {containerRect && lines.map((line) => (
        <line
          key={`${line.fieldId}-${line.elementId}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="hsl(var(--primary))"
          strokeWidth={line.isCollapsed ? 1 : 1.5}
          strokeDasharray={line.isCollapsed ? '2 2' : '4 2'}
          opacity={line.isCollapsed ? 0.3 : 0.6}
        />
      ))}

      {/* Drag rubber-band line */}
      {dragState && containerRect && (() => {
        const dragFieldEl = fieldRefs.current?.get(dragState.fieldId)
        if (!dragFieldEl) return null
        const fieldRect = dragFieldEl.getBoundingClientRect()
        return (
          <line
            data-drag="true"
            x1={fieldRect.right - containerRect.left}
            y1={fieldRect.top + fieldRect.height / 2 - containerRect.top}
            x2={dragState.currentX - containerRect.left}
            y2={dragState.currentY - containerRect.top}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeDasharray="6 3"
            opacity={0.8}
          />
        )
      })()}
    </svg>
  )
})
