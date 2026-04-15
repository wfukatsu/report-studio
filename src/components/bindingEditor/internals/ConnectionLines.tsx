/**
 * ConnectionLines — SVG overlay with Bezier curves, hover highlight, and disconnect buttons.
 *
 * Port of v1 ConnectionLines:
 * - Bezier paths with curve factor 0.4 (not straight lines)
 * - Indigo (#6366f1) as primary connection color
 * - Group color coding
 * - Hover: line thickens, disconnect ✕ button appears
 * - 14px invisible hit area for easy interaction
 */

import { memo, useCallback, useState } from 'react'
import type { LinePos, DragState } from '../types'
import { getGroupColor } from '../types'

const CURVE_FACTOR = 0.4

interface ConnectionLinesProps {
  readonly lines: readonly LinePos[]
  readonly dragState: DragState | null
  readonly fieldRefs: React.RefObject<Map<string, HTMLElement | null>>
  readonly containerRef: React.RefObject<HTMLDivElement | null>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredGroupId: string | null
  readonly hoveredFieldId: string | null
  readonly onHoverLine: (groupId: string | null, fieldId: string | null) => void
  readonly onDisconnectLine?: (fieldId: string, elementId: string) => void
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * CURVE_FACTOR
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
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
  onDisconnectLine,
}: ConnectionLinesProps) {
  const containerRect = containerRef.current?.getBoundingClientRect()
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null)

  const handleMouseEnter = useCallback(
    (key: string, groupId: string, fieldId: string) => () => {
      setHoveredLineKey(key)
      onHoverLine(groupId, fieldId)
    },
    [onHoverLine],
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredLineKey(null)
    onHoverLine(null, null)
  }, [onHoverLine])

  const isHighlighted = (line: LinePos) => {
    if (!hoveredGroupId && !hoveredFieldId) return true
    if (hoveredFieldId) return line.fieldId === hoveredFieldId
    return line.groupId === hoveredGroupId
  }

  return (
    <svg
      className="absolute inset-0 overflow-visible"
      style={{ zIndex: 10, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {/* Connection lines */}
      {containerRect && lines.map((line) => {
        const key = `${line.fieldId}-${line.elementId}`
        const groupIndex = groupIndexMap.get(line.groupId) ?? 0
        const color = getGroupColor(groupIndex)
        const highlighted = isHighlighted(line)
        const isHovered = hoveredLineKey === key
        const midX = (line.x1 + line.x2) / 2
        const midY = (line.y1 + line.y2) / 2

        return (
          <g key={key}>
            {/* Invisible wide hit area */}
            <path
              d={bezierPath(line.x1, line.y1, line.x2, line.y2)}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onMouseEnter={handleMouseEnter(key, line.groupId, line.fieldId)}
              onMouseLeave={handleMouseLeave}
            />

            {/* Visible line */}
            <path
              d={bezierPath(line.x1, line.y1, line.x2, line.y2)}
              fill="none"
              stroke={color}
              strokeWidth={isHovered ? 3 : highlighted ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={line.isCollapsed ? '4 3' : undefined}
              opacity={highlighted ? (isHovered ? 1 : 0.7) : 0.15}
              style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
            />

            {/* Endpoints */}
            <circle
              cx={line.x1} cy={line.y1}
              r={isHovered ? 4 : 3}
              fill={color}
              opacity={highlighted ? 0.8 : 0.15}
              style={{ transition: 'r 0.15s, opacity 0.15s' }}
            />
            <circle
              cx={line.x2} cy={line.y2}
              r={isHovered ? 4 : 3}
              fill={color}
              opacity={highlighted ? 0.8 : 0.15}
              style={{ transition: 'r 0.15s, opacity 0.15s' }}
            />

            {/* Disconnect button (visible on hover) */}
            {isHovered && onDisconnectLine && (
              <g
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={() => onDisconnectLine(line.fieldId, line.elementId)}
              >
                <circle
                  cx={midX} cy={midY} r={10}
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                <text
                  x={midX} y={midY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  fontSize={11}
                  fontWeight={700}
                >
                  ✕
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* Drag rubber-band line */}
      {dragState && containerRect && (() => {
        const dragFieldEl = fieldRefs.current?.get(dragState.fieldId)
        if (!dragFieldEl) return null
        const fieldRect = dragFieldEl.getBoundingClientRect()
        const x1 = fieldRect.right - containerRect.left
        const y1 = fieldRect.top + fieldRect.height / 2 - containerRect.top
        const x2 = dragState.currentX - containerRect.left
        const y2 = dragState.currentY - containerRect.top
        return (
          <>
            <path
              d={bezierPath(x1, y1, x2, y2)}
              fill="none"
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="6 3"
              strokeLinecap="round"
              opacity={0.8}
            />
            <circle cx={x1} cy={y1} r={4} fill="#6366f1" opacity={0.8} />
          </>
        )
      })()}
    </svg>
  )
})
