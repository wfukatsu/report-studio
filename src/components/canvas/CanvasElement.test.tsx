import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CanvasElement } from './CanvasElement'
import type { ReportElement } from '@/types'

// Mock dnd-kit — we only care about resize logic here
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

// Mock store calls used inside CanvasElement
vi.mock('@/store/reportStore', () => ({
  useReportStore: (selector: (s: unknown) => unknown) => {
    const fakeStore = {
      removeElement: vi.fn(),
      updateElement: vi.fn(),
    }
    return selector(fakeStore)
  },
  selectActivePageId: (s: { activePageId?: string }) => s.activePageId ?? 'page-1',
}))

function makeTextElement(overrides: Partial<ReportElement> = {}): ReportElement {
  return {
    id: 'el-1',
    type: 'text',
    name: 'テスト',
    position: { x: 10, y: 10 },
    size: { width: 100, height: 50 },
    zIndex: 1,
    visible: true,
    locked: false,
    printable: true,
    content: 'hello',
    style: {},
    ...overrides,
  } as ReportElement
}

describe('CanvasElement — Shift+リサイズ アスペクト比固定', () => {
  let onResize: ReturnType<typeof vi.fn>
  let onMove: ReturnType<typeof vi.fn>
  let onSelect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onResize = vi.fn()
    onMove = vi.fn()
    onSelect = vi.fn()
  })

  function renderElement(element: ReportElement) {
    return render(
      <CanvasElement
        element={element}
        isSelected={true}
        onSelect={onSelect}
        onMove={onMove}
        onResize={onResize}
      />,
    )
  }

  function getHandle(container: HTMLElement, handle: string) {
    return container.querySelector(`[data-resize-handle="${handle}"]`) as HTMLElement | null
  }

  function dispatchWindowPointerMove(clientX: number, clientY: number, shiftKey = false) {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, shiftKey, bubbles: true }))
  }

  function dispatchWindowPointerUp(clientX: number, clientY: number) {
    window.dispatchEvent(new PointerEvent('pointerup', { clientX, clientY, bubbles: true }))
  }

  it('SE ハンドルで Shift なし: 幅が増加し高さは不変', () => {
    const el = makeTextElement({ size: { width: 100, height: 50 } }) // ratio=2
    const { container } = renderElement(el)
    const seHandle = getHandle(container as HTMLElement, 'se')
    if (!seHandle) return // handle not rendered — skip

    fireEvent.pointerDown(seHandle, { clientX: 0, clientY: 0, pointerId: 1 })
    // Move 20px right, 0px down → width should increase, height unchanged
    dispatchWindowPointerMove(20, 0, false)
    dispatchWindowPointerUp(20, 0)

    expect(onResize).toHaveBeenCalled()
    const { width, height } = onResize.mock.calls[onResize.mock.calls.length - 1][1]
    expect(width).toBeGreaterThan(100)
    expect(height).toBeCloseTo(50, 0) // height unchanged
  })

  it('SE ハンドルで Shift+ドラッグ: アスペクト比 (2:1) が維持される', () => {
    const el = makeTextElement({ size: { width: 100, height: 50 } }) // ratio=2
    const { container } = renderElement(el)
    const seHandle = getHandle(container as HTMLElement, 'se')
    if (!seHandle) return

    fireEvent.pointerDown(seHandle, { clientX: 0, clientY: 0, pointerId: 1 })
    // Move 20px right → new width ≈ 100 + pxToMm(20). Height should follow ratio.
    dispatchWindowPointerMove(20, 0, true)
    dispatchWindowPointerUp(20, 0)

    expect(onResize).toHaveBeenCalled()
    const { width, height } = onResize.mock.calls[onResize.mock.calls.length - 1][1]
    // ratio should be maintained: width / height ≈ 2
    expect(width / height).toBeCloseTo(2, 1)
  })

  it('辺ハンドル (E) で Shift+ドラッグ: アスペクト比は維持しない', () => {
    const el = makeTextElement({ size: { width: 100, height: 50 } })
    const { container } = renderElement(el)
    const eHandle = getHandle(container as HTMLElement, 'e')
    if (!eHandle) return

    fireEvent.pointerDown(eHandle, { clientX: 0, clientY: 0, pointerId: 1 })
    dispatchWindowPointerMove(20, 0, true)
    dispatchWindowPointerUp(20, 0)

    expect(onResize).toHaveBeenCalled()
    const { height } = onResize.mock.calls[onResize.mock.calls.length - 1][1]
    // Height should be unchanged (E handle only affects width)
    expect(height).toBeCloseTo(50, 0)
  })

  it('NW ハンドルで Shift+ドラッグ: x/y 座標も連動して更新される', () => {
    const el = makeTextElement({
      position: { x: 20, y: 20 },
      size: { width: 100, height: 50 },
    })
    const { container } = renderElement(el)
    const nwHandle = getHandle(container as HTMLElement, 'nw')
    if (!nwHandle) return

    fireEvent.pointerDown(nwHandle, { clientX: 0, clientY: 0, pointerId: 1 })
    dispatchWindowPointerMove(-10, -5, true)
    dispatchWindowPointerUp(-10, -5)

    // Both onResize and onMove should be called for NW handle
    expect(onResize).toHaveBeenCalled()
    expect(onMove).toHaveBeenCalled()
    const { width, height } = onResize.mock.calls[onResize.mock.calls.length - 1][1]
    expect(width / height).toBeCloseTo(2, 1)

    const { x, y } = onMove.mock.calls[onMove.mock.calls.length - 1][1]
    // Position should have shifted (element grew towards top-left)
    expect(x).toBeLessThanOrEqual(20)
    expect(y).toBeLessThanOrEqual(20)
  })
})

describe('CanvasElement — クリックセレクト', () => {
  it('Shift+クリックで multi=true が onSelect に渡る', () => {
    const onSelect = vi.fn()
    const el = makeTextElement()
    const { container } = render(
      <CanvasElement
        element={el}
        isSelected={false}
        onSelect={onSelect}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />,
    )
    const wrapper = container.firstChild as HTMLElement
    fireEvent.click(wrapper, { shiftKey: true })
    expect(onSelect).toHaveBeenCalledWith('el-1', true)
  })

  it('通常クリックで multi=false が onSelect に渡る', () => {
    const onSelect = vi.fn()
    const el = makeTextElement()
    const { container } = render(
      <CanvasElement
        element={el}
        isSelected={false}
        onSelect={onSelect}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />,
    )
    const wrapper = container.firstChild as HTMLElement
    fireEvent.click(wrapper, { shiftKey: false })
    expect(onSelect).toHaveBeenCalledWith('el-1', false)
  })
})
