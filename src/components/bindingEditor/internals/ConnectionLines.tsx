/**
 * ConnectionLines — SVG overlay with group-colored arrows and hover highlight.
 *
 * - Each connection line is colored by its schema group
 * - Hovering a line highlights it and dims others
 * - Arrow markers show direction (field → element)
 * - Drag rubber-band line shown during drag-to-connect
 */

import { memo, useCallback } from 'react'
import type { LinePos, DragState } from '../types'
import { getGroupColor } from '../types'

interface ConnectionLinesProps {
  readonly lines: readonly LinePos[]
  readonly dragState: DragState | null
  readonly fieldRefs: React.RefObject<Map<string, HTMLElement | null>>
  readonly containerRef: React.RefObject<HTMLDivElement | null>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredGroupId: string | null
  readonly hoveredFieldId: string | null
  readonly onHoverLine: (groupId: string | null, fieldId: string | null) => void
}

export const ConnectionLines = memo(function ConnectionLines({
  lines,
  dragState,
  fieldRefs,
  containerRef,
  groupIndexMap,
  hoveredGroupId,
  hoveredFieldId,
  onHoverLine,
}: ConnectionLinesProps) {
  const containerRect = containerRef.current?.getBoundingClientRect()

  const handleMouseEnter = useCallback(
    (groupId: string, fieldId: string) => () => onHoverLine(groupId, fieldId),
    [onHoverLine],
  )

  const handleMouseLeave = useCallback(
    () => onHoverLine(null, null),
    [onHoverLine],
  )

  // Determine if a line should be highlighted
  const isHighlighted = (line: LinePos) => {
    if (!hoveredGroupId && !hoveredFieldId) return true // no hover = all normal
    if (hoveredFieldId) return line.fieldId === hoveredFieldId
    return line.groupId === hoveredGroupId
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ zIndex: 10 }}
      aria-hidden="true"
    >
      {/* Arrow marker definitions per group */}
      <defs>
        {Array.from(groupIndexMap.entries()).map(([groupId, index]) => (
          <marker
            key={groupId}
            id={`arrow-${groupId}`}
            viewBox="0 0 10 7"
            refX="9"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={getGroupColor(index)}
            />
          </marker>
        ))}
        {/* Drag arrow marker */}
        <marker
          id="arrow-drag"
          viewBox="0 0 10 7"
          refX="9"
          refY="3.5"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
        </marker>
      </defs>

      {/* Connection lines */}
      {containerRect && lines.map((line) => {
        const groupIndex = groupIndexMap.get(line.groupId) ?? 0
        const color = getGroupColor(groupIndex)
        const highlighted = isHighlighted(line)

        return (
          <line
            key={`${line.fieldId}-${line.elementId}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={color}
            strokeWidth={highlighted ? 2 : 1}
            strokeDasharray={line.isCollapsed ? '2 2' : undefined}
            opacity={highlighted ? 0.8 : 0.15}
            markerEnd={`url(#arrow-${line.groupId})`}
            style={{ pointerEvents: 'stroke', cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={handleMouseEnter(line.groupId, line.fieldId)}
            onMouseLeave={handleMouseLeave}
          />
        )
      })}

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
            markerEnd="url(#arrow-drag)"
          />
        )
      })()}
    </svg>
  )
})
