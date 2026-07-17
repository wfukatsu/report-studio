/**
 * ConnectionLines — SVG overlay: bezier path geometry, group color coding,
 * hover highlight + disconnect button, drag rubber band.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ConnectionLines } from './ConnectionLines'
import { GROUP_COLORS } from '../types'
import type { LinePos, DragState } from '../types'

function fakeRect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left, top, right, bottom,
    width: right - left, height: bottom - top,
    x: left, y: top, toJSON: () => ({}),
  } as DOMRect
}

function fakeContainer(): HTMLDivElement {
  const div = document.createElement('div')
  div.getBoundingClientRect = () => fakeRect(0, 0, 800, 600)
  return div
}

const LINE: LinePos = {
  x1: 0, y1: 10, x2: 100, y2: 50,
  fieldId: 'f1', elementId: 'e1', groupId: 'g1', isCollapsed: false,
}

function renderLines(overrides: Partial<React.ComponentProps<typeof ConnectionLines>> = {}) {
  const onHoverLine = vi.fn()
  const onDisconnectLine = vi.fn()
  const utils = render(
    <ConnectionLines
      lines={[LINE]}
      dragState={null}
      fieldRefs={{ current: new Map() }}
      elementRefs={{ current: new Map() }}
      containerRef={{ current: fakeContainer() }}
      groupIndexMap={new Map([['g1', 0], ['g2', 1]])}
      hoveredGroupId={null}
      hoveredFieldId={null}
      onHoverLine={onHoverLine}
      onDisconnectLine={onDisconnectLine}
      {...overrides}
    />,
  )
  return { ...utils, onHoverLine, onDisconnectLine }
}

describe('ConnectionLines — 描画', () => {
  it('draws a bezier path with curve factor 0.4 between the endpoints', () => {
    const { container } = renderLines()
    const paths = container.querySelectorAll('path')
    // hit-area path + visible path
    expect(paths).toHaveLength(2)
    // dx = |100 - 0| * 0.4 = 40
    expect(paths[1].getAttribute('d')).toBe('M 0,10 C 40,10 60,50 100,50')
    expect(paths[1].getAttribute('stroke')).toBe(GROUP_COLORS[0])
  })

  it('color-codes lines by their schema group index', () => {
    const { container } = renderLines({
      lines: [{ ...LINE, groupId: 'g2' }],
    })
    expect(container.querySelectorAll('path')[1].getAttribute('stroke')).toBe(GROUP_COLORS[1])
  })

  it('renders collapsed connections with a dashed stroke', () => {
    const { container } = renderLines({ lines: [{ ...LINE, isCollapsed: true }] })
    expect(container.querySelectorAll('path')[1].getAttribute('stroke-dasharray')).toBe('4 3')
  })

  it('renders nothing when the container is not mounted', () => {
    const { container } = renderLines({ containerRef: { current: null } })
    expect(container.querySelectorAll('path')).toHaveLength(0)
  })

  it('dims lines that do not belong to the hovered field', () => {
    const other: LinePos = { ...LINE, fieldId: 'f2', elementId: 'e2' }
    const { container } = renderLines({ lines: [LINE, other], hoveredFieldId: 'f2' })
    const visible = Array.from(container.querySelectorAll('path')).filter(
      (p) => p.getAttribute('stroke') !== 'transparent',
    )
    expect(visible[0].getAttribute('opacity')).toBe('0.15') // f1 dimmed
    expect(visible[1].getAttribute('opacity')).toBe('0.7')  // f2 highlighted
  })
})

describe('ConnectionLines — ホバーと切断', () => {
  it('notifies hover enter/leave with groupId and fieldId', () => {
    const { container, onHoverLine } = renderLines()
    const hitArea = container.querySelectorAll('path')[0]

    fireEvent.mouseEnter(hitArea)
    expect(onHoverLine).toHaveBeenLastCalledWith('g1', 'f1')

    fireEvent.mouseLeave(hitArea)
    expect(onHoverLine).toHaveBeenLastCalledWith(null, null)
  })

  it('shows the ✕ button on hover and fires onDisconnectLine on click', () => {
    const { container, onDisconnectLine } = renderLines()
    const hitArea = container.querySelectorAll('path')[0]

    // No disconnect button before hover
    expect(container.querySelector('text')).toBeNull()

    fireEvent.mouseEnter(hitArea)
    const disconnectGroup = container.querySelector('text')!.closest('g')!
    fireEvent.click(disconnectGroup)

    expect(onDisconnectLine).toHaveBeenCalledWith('f1', 'e1')
  })
})

describe('ConnectionLines — ドラッグ ラバーバンド', () => {
  it('draws an indigo dashed band from the dragged field toward the cursor', () => {
    const fieldEl = document.createElement('div')
    fieldEl.getBoundingClientRect = () => fakeRect(100, 100, 200, 120)
    const dragState: DragState = {
      source: 'field', fieldId: 'f1',
      startX: 150, startY: 110, currentX: 400, currentY: 300,
    }
    const { container } = renderLines({
      lines: [],
      dragState,
      fieldRefs: { current: new Map([['f1', fieldEl]]) },
    })

    const band = container.querySelector('path')!
    // Cursor (400) is right of the field → band exits from the right edge (200)
    expect(band.getAttribute('d')).toBe(`M 200,110 C ${200 + 80},110 ${400 - 80},300 400,300`)
    expect(band.getAttribute('stroke')).toBe('#6366f1')
    expect(band.getAttribute('stroke-dasharray')).toBe('6 3')
  })

  it('uses green for element-sourced drags and skips rendering when the source ref is missing', () => {
    const elementEl = document.createElement('div')
    elementEl.getBoundingClientRect = () => fakeRect(500, 200, 600, 220)
    const dragState: DragState = {
      source: 'element', pageId: 'p1', elementId: 'e1', elementLabel: 'x',
      startX: 550, startY: 210, currentX: 100, currentY: 100,
    }
    const { container } = renderLines({
      lines: [],
      dragState,
      elementRefs: { current: new Map([['e1', elementEl]]) },
    })
    const band = container.querySelector('path')!
    expect(band.getAttribute('stroke')).toBe('#00C853')
    // Cursor (100) is left of the element → band exits from the left edge (500)
    expect(band.getAttribute('d')!.startsWith('M 500,210')).toBe(true)

    // Missing ref → no rubber band
    const { container: empty } = renderLines({
      lines: [],
      dragState,
      elementRefs: { current: new Map() },
    })
    expect(empty.querySelector('path')).toBeNull()
  })
})
