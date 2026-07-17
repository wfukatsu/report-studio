import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDragSelect } from './useDragSelect'
import type { Section } from '@/types'

// Helper to create a minimal section with elements
function makeSection(elements: { id: string; x: number; y: number; w: number; h: number }[]): Section {
  return {
    id: 'sec-1',
    sectionType: 'body',
    height: 200,
    elements: elements.map((e) => ({
      id: e.id,
      type: 'text' as const,
      name: e.id,
      position: { x: e.x, y: e.y },
      size: { width: e.w, height: e.h },
      zIndex: 0,
      visible: true,
      locked: false,
      printable: true,
      content: '',
      style: {},
    })),
  }
}

// Helper to create fake pointer events
function makePointerEvent(
  _type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  target: HTMLElement = document.createElement('div'),
  shiftKey = false,
): React.PointerEvent<HTMLDivElement> {
  const containerEl = document.createElement('div')
  // Mock getBoundingClientRect to return a fixed container position
  containerEl.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {},
  })
  containerEl.setPointerCapture = vi.fn()

  return {
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: y,
    shiftKey,
    target,
    currentTarget: containerEl,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent<HTMLDivElement>
}

describe('useDragSelect — 初期状態', () => {
  it('returns null marquee initially', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))
    expect(result.current.marquee).toBeNull()
  })

  it('returns handler functions', () => {
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds: vi.fn(),
    }))
    expect(typeof result.current.onPointerDown).toBe('function')
    expect(typeof result.current.onPointerMove).toBe('function')
    expect(typeof result.current.onPointerUp).toBe('function')
    expect(typeof result.current.consumeClickIfDragSelected).toBe('function')
  })
})

describe('useDragSelect — readonly mode', () => {
  it('ignores pointer down in readonly mode', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: true,
      onSelectIds,
    }))

    act(() => {
      result.current.onPointerDown(makePointerEvent('pointerdown', 100, 100))
    })

    // No marquee should start
    act(() => {
      result.current.onPointerMove(makePointerEvent('pointermove', 200, 200))
    })
    expect(result.current.marquee).toBeNull()
  })
})

describe('useDragSelect — drag select', () => {
  it('starts marquee on pointer down and move', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    act(() => {
      result.current.onPointerDown(makePointerEvent('pointerdown', 10, 10))
    })
    act(() => {
      result.current.onPointerMove(makePointerEvent('pointermove', 110, 110))
    })

    expect(result.current.marquee).not.toBeNull()
    expect(result.current.marquee?.width).toBeGreaterThan(0)
    expect(result.current.marquee?.height).toBeGreaterThan(0)
  })

  it('clears marquee on pointer up', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 10, 10)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 110, 110)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 110, 110)))

    expect(result.current.marquee).toBeNull()
  })

  it('selects elements that intersect the marquee', () => {
    const onSelectIds = vi.fn()
    // Element at position (10, 10) size (20, 10) mm → roughly 10*3.78 = 37.8px from top-left
    const sections = [makeSection([{ id: 'el-1', x: 5, y: 5, w: 20, h: 10 }])]

    const { result } = renderHook(() => useDragSelect({
      sections,
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    // Start drag at pixel (0, 0), move to (200, 200) — should cover the element
    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 0, 0)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 200, 200)))

    expect(onSelectIds).toHaveBeenCalledWith(expect.arrayContaining(['el-1']))
  })

  it('does not call onSelectIds for tiny drag', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    // Very small drag (less than 4px)
    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 10, 10)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 12, 12)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 12, 12)))

    expect(onSelectIds).not.toHaveBeenCalled()
  })
})

describe('useDragSelect — consumeClickIfDragSelected', () => {
  it('returns false when no drag select occurred', () => {
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds: vi.fn(),
    }))
    expect(result.current.consumeClickIfDragSelected()).toBe(false)
  })

  it('returns true after drag select and resets', () => {
    const onSelectIds = vi.fn()
    const sections = [makeSection([{ id: 'el-1', x: 5, y: 5, w: 30, h: 30 }])]

    const { result } = renderHook(() => useDragSelect({
      sections,
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 0, 0)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 200, 200)))

    expect(result.current.consumeClickIfDragSelected()).toBe(true)
    // Second call returns false (already consumed)
    expect(result.current.consumeClickIfDragSelected()).toBe(false)
  })

  it('does not return true when no elements were selected by drag', () => {
    const onSelectIds = vi.fn()
    const sections: Section[] = []

    const { result } = renderHook(() => useDragSelect({
      sections,
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    // Drag in empty space
    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 0, 0)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 200, 200)))

    expect(onSelectIds).not.toHaveBeenCalled()
    expect(result.current.consumeClickIfDragSelected()).toBe(false)
  })
})

describe('useDragSelect — Shift+マーキー 追加選択', () => {
  it('merges new elements into currentSelectedIds when shiftKey is true', () => {
    const onSelectIds = vi.fn()
    const sections = [makeSection([
      { id: 'existing-1', x: 5, y: 5, w: 20, h: 10 },
      { id: 'new-1', x: 30, y: 30, w: 20, h: 10 },
    ])]

    const { result } = renderHook(() => useDragSelect({
      sections,
      zoom: 1,
      readonly: false,
      onSelectIds,
      currentSelectedIds: ['existing-1'],
    }))

    // Shift+drag that covers only new-1 (around x=30, y=30 in mm → ~113px)
    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 100, 100, document.createElement('div'), true)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 200, 200)))

    expect(onSelectIds).toHaveBeenCalledOnce()
    const called = onSelectIds.mock.calls[0][0] as string[]
    expect(called).toContain('existing-1')
    expect(called).toContain('new-1')
  })

  it('deduplicates when existing and new selections overlap', () => {
    const onSelectIds = vi.fn()
    const sections = [makeSection([
      { id: 'el-1', x: 5, y: 5, w: 20, h: 10 },
    ])]

    const { result } = renderHook(() => useDragSelect({
      sections,
      zoom: 1,
      readonly: false,
      onSelectIds,
      currentSelectedIds: ['el-1'],
    }))

    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 0, 0, document.createElement('div'), true)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 200, 200)))

    const called = onSelectIds.mock.calls[0][0] as string[]
    expect(called.filter((id) => id === 'el-1').length).toBe(1)
  })

  it('replaces selection (no merge) when shiftKey is false', () => {
    const onSelectIds = vi.fn()
    const sections = [makeSection([
      { id: 'el-1', x: 5, y: 5, w: 20, h: 10 },
    ])]

    const { result } = renderHook(() => useDragSelect({
      sections,
      zoom: 1,
      readonly: false,
      onSelectIds,
      currentSelectedIds: ['other-existing'],
    }))

    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 0, 0, document.createElement('div'), false)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 200, 200)))

    const called = onSelectIds.mock.calls[0][0] as string[]
    expect(called).toEqual(['el-1'])
    expect(called).not.toContain('other-existing')
  })

  it('does not call onSelectIds when tiny Shift+drag hits no elements', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds,
      currentSelectedIds: ['existing-1'],
    }))

    act(() => result.current.onPointerDown(makePointerEvent('pointerdown', 10, 10, document.createElement('div'), true)))
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 12, 12)))
    act(() => result.current.onPointerUp(makePointerEvent('pointerup', 12, 12)))

    expect(onSelectIds).not.toHaveBeenCalled()
  })
})

describe('useDragSelect — canvas element clicks are ignored', () => {
  it('does not start drag when pointer down on canvas element', () => {
    const onSelectIds = vi.fn()
    const { result } = renderHook(() => useDragSelect({
      sections: [],
      zoom: 1,
      readonly: false,
      onSelectIds,
    }))

    // Create a target that has a canvas element ancestor
    const canvasEl = document.createElement('div')
    canvasEl.setAttribute('data-canvas-element', 'true')
    const childEl = document.createElement('div')
    canvasEl.appendChild(childEl)

    const event = makePointerEvent('pointerdown', 100, 100, childEl)
    act(() => result.current.onPointerDown(event))

    // Try to move - should not create marquee since drag wasn't started
    act(() => result.current.onPointerMove(makePointerEvent('pointermove', 200, 200)))
    expect(result.current.marquee).toBeNull()
  })
})
