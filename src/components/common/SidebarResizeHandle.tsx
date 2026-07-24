/**
 * SidebarResizeHandle — drag (and keyboard) resize strip for the editor
 * sidebars (#439). Rendered as an absolutely-positioned 4px strip on the
 * sidebar's inner edge; the parent <aside> must be `relative`.
 */
import { useRef } from 'react'

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 256

const KEYBOARD_STEP = 16

interface Props {
  /** Which sidebar this handle belongs to — determines drag direction and edge. */
  readonly side: 'left' | 'right'
  readonly width: number
  readonly onResize: (width: number) => void
  readonly ariaLabel: string
}

const clamp = (w: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w))

export function SidebarResizeHandle({ side, width, onResize, ariaLabel }: Props) {
  const dragStart = useRef<{ x: number; width: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(width)}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      className={`absolute inset-y-0 z-10 w-1 cursor-col-resize touch-none select-none
        hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none
        ${side === 'left' ? 'right-0' : 'left-0'}`}
      onPointerDown={(e) => {
        dragStart.current = { x: e.clientX, width }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const start = dragStart.current
        if (!start) return
        const dx = e.clientX - start.x
        onResize(clamp(side === 'left' ? start.width + dx : start.width - dx))
      }}
      onPointerUp={() => { dragStart.current = null }}
      onPointerCancel={() => { dragStart.current = null }}
      onKeyDown={(e) => {
        const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
        const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
        if (e.key === grow) {
          e.preventDefault()
          onResize(clamp(width + KEYBOARD_STEP))
        } else if (e.key === shrink) {
          e.preventDefault()
          onResize(clamp(width - KEYBOARD_STEP))
        }
      }}
    />
  )
}
