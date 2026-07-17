/**
 * useConnectionLines — SVG line coordinate calculation + group expansion state.
 *
 * jsdom has no layout, so getBoundingClientRect is stubbed per element and
 * requestAnimationFrame is made synchronous to make line recalculation
 * deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConnectionLines } from './useConnectionLines'
import type { BindingConnection } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }

function fakeDiv(rect: Rect): HTMLDivElement {
  const div = document.createElement('div')
  div.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => rect }) as DOMRect
  return div
}

beforeEach(() => {
  // Synchronous rAF so setLines runs within act()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// NOTE: connections must be reference-stable across renders (as in production,
// where useBindingState memoizes them). An inline array literal in the hook
// callback would re-trigger the recalc effect on every render.
const CONNECTION: BindingConnection = { fieldId: 'f1', elementId: 'e1', groupId: 'g1' }
const ONE_CONNECTION: readonly BindingConnection[] = [CONNECTION]
const NO_CONNECTIONS: readonly BindingConnection[] = []

// ---------------------------------------------------------------------------
// Line calculation
// ---------------------------------------------------------------------------

describe('useConnectionLines — line calculation', () => {
  it('computes container-relative coordinates: element right edge → field left edge, vertically centered', () => {
    const { result } = renderHook(
      ({ connections }) => useConnectionLines(connections),
      { initialProps: { connections: ONE_CONNECTION } },
    )

    act(() => {
      result.current.containerRef.current = fakeDiv({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 })
      // Element card in the left panel
      result.current.elementRefs.current.set('e1', fakeDiv({ left: 120, top: 100, right: 320, bottom: 130, width: 200, height: 30 }))
      // Field card in the center panel
      result.current.fieldRefs.current.set('f1', fakeDiv({ left: 500, top: 200, right: 700, bottom: 220, width: 200, height: 20 }))
      result.current.triggerRecalc()
    })

    expect(result.current.lines).toHaveLength(1)
    const line = result.current.lines[0]
    // x1 = element.right - container.left, y1 = element vertical center - container.top
    expect(line.x1).toBe(320 - 100)
    expect(line.y1).toBe(100 + 15 - 50)
    // x2 = field.left - container.left, y2 = field vertical center - container.top
    expect(line.x2).toBe(500 - 100)
    expect(line.y2).toBe(200 + 10 - 50)
    expect(line).toMatchObject({ fieldId: 'f1', elementId: 'e1', groupId: 'g1', isCollapsed: false })
  })

  it('skips connections whose field or element ref is missing', () => {
    const connections: BindingConnection[] = [
      CONNECTION,
      { fieldId: 'f2', elementId: 'e2', groupId: 'g1' }, // e2 has no ref
    ]
    const { result } = renderHook(() => useConnectionLines(connections))

    act(() => {
      result.current.containerRef.current = fakeDiv({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 })
      result.current.elementRefs.current.set('e1', fakeDiv({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }))
      result.current.fieldRefs.current.set('f1', fakeDiv({ left: 300, top: 40, right: 400, bottom: 60, width: 100, height: 20 }))
      result.current.fieldRefs.current.set('f2', fakeDiv({ left: 300, top: 80, right: 400, bottom: 100, width: 100, height: 20 }))
      result.current.triggerRecalc()
    })

    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].fieldId).toBe('f1')
  })

  it('produces no lines when the container is not mounted', () => {
    const { result } = renderHook(() => useConnectionLines(ONE_CONNECTION))
    act(() => { result.current.triggerRecalc() })
    expect(result.current.lines).toEqual([])
  })

  it('recomputes lines when connections change', () => {
    const { result, rerender } = renderHook(
      ({ connections }) => useConnectionLines(connections),
      { initialProps: { connections: NO_CONNECTIONS } },
    )

    act(() => {
      result.current.containerRef.current = fakeDiv({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 })
      result.current.elementRefs.current.set('e1', fakeDiv({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }))
      result.current.fieldRefs.current.set('f1', fakeDiv({ left: 300, top: 40, right: 400, bottom: 60, width: 100, height: 20 }))
      result.current.triggerRecalc()
    })
    expect(result.current.lines).toEqual([])

    act(() => { rerender({ connections: ONE_CONNECTION }) })
    expect(result.current.lines).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Expansion state
// ---------------------------------------------------------------------------

describe('useConnectionLines — group expansion state', () => {
  it('toggleFieldGroup flips membership, expandFieldGroup is idempotent', () => {
    const { result } = renderHook(() => useConnectionLines(NO_CONNECTIONS))

    act(() => result.current.toggleFieldGroup('g1'))
    expect(result.current.expandedFieldGroups.has('g1')).toBe(true)

    act(() => result.current.toggleFieldGroup('g1'))
    expect(result.current.expandedFieldGroups.has('g1')).toBe(false)

    act(() => result.current.expandFieldGroup('g1'))
    act(() => result.current.expandFieldGroup('g1'))
    expect(result.current.expandedFieldGroups.has('g1')).toBe(true)
    expect(result.current.expandedFieldGroups.size).toBe(1)
  })

  it('element group expansion is tracked independently from field groups', () => {
    const { result } = renderHook(() => useConnectionLines(NO_CONNECTIONS))

    act(() => result.current.toggleElementGroup('page-1'))
    act(() => result.current.expandElementGroup('page-2'))

    expect(result.current.expandedElementGroups.has('page-1')).toBe(true)
    expect(result.current.expandedElementGroups.has('page-2')).toBe(true)
    expect(result.current.expandedFieldGroups.size).toBe(0)
  })
})
