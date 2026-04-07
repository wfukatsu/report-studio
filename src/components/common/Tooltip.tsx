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

import { useRef, useState, useCallback, type ReactNode } from 'react'
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
  const [actualPlacement, setActualPlacement] = useState(placement)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      // Flip to 'top' if too close to viewport bottom
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        setActualPlacement(placement === 'bottom' && spaceBelow < 60 ? 'top' : placement)
      }
      setVisible(true)
    }, delay)
  }, [placement, delay])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  if (!content) return <>{children}</>

  return (
    <span
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-[9999] whitespace-nowrap',
            'rounded bg-popover border border-border text-popover-foreground shadow-md',
            'px-2 py-1 text-xs leading-snug',
            'left-1/2 -translate-x-1/2',
            actualPlacement === 'bottom'
              ? 'top-full mt-1.5'
              : 'bottom-full mb-1.5',
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
