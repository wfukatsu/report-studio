/**
 * Tooltip — lightweight hover tooltip using CSS position: absolute.
 * No portals, no third-party deps. Appears below the trigger by default.
 * Flips to above when close to the bottom edge of the viewport.
 *
 * Usage:
 *   <Tooltip content="元に戻す (⌘Z)">
 *     <button>...</button>
 *   </Tooltip>
 */

import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** Preferred placement. Default: 'bottom' */
  placement?: 'top' | 'bottom'
  /** Extra class on the wrapper span */
  className?: string
  /** Delay before showing in ms. Default: 400 */
  delay?: number
}

export function Tooltip({ content, children, placement = 'bottom', className, delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }, [delay])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    setPos(null)
  }, [])

  // Position the tooltip after it renders via portal
  useEffect(() => {
    if (!visible || !wrapperRef.current || !tooltipRef.current) return
    const triggerRect = wrapperRef.current.getBoundingClientRect()
    const tipEl = tooltipRef.current
    const tipW = tipEl.offsetWidth
    const tipH = tipEl.offsetHeight

    const spaceBelow = window.innerHeight - triggerRect.bottom
    const placeAbove = placement === 'top' || (placement === 'bottom' && spaceBelow < tipH + 12)

    let top = placeAbove
      ? triggerRect.top - tipH - 6
      : triggerRect.bottom + 6
    let left = triggerRect.left + triggerRect.width / 2 - tipW / 2

    // Clamp horizontal: keep within viewport with 8px margin
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8))
    // Clamp vertical
    top = Math.max(4, Math.min(top, window.innerHeight - tipH - 4))

    setPos({ top, left })
  }, [visible, placement])

  // Auto-hide on scroll (HTML5 drag does not fire mouseleave reliably) and Escape.
  // Listeners are only registered while a tooltip is visible.
  useEffect(() => {
    if (!visible) return
    const onScroll = () => hide()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
      window.removeEventListener('keydown', onKey)
    }
  }, [visible, hide])

  if (!content) return <>{children}</>

  return (
    <span
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={hide}
      onDragStart={hide}
      onPointerCancel={hide}
    >
      {children}
      {visible && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            'pointer-events-none fixed',
            'rounded bg-popover border border-border text-popover-foreground shadow-md',
            'px-2 py-1 text-xs leading-snug',
          )}
          style={{
            zIndex: 99999,
            maxWidth: 'min(320px, calc(100vw - 16px))',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
          }}
        >
          {content}
        </span>,
        document.body,
      )}
    </span>
  )
}
