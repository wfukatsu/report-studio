/**
 * Compact zoom control for status bars.
 * Shows current zoom %, +/- buttons, and a dropdown with presets + fit modes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ZOOM_MIN, ZOOM_MAX } from '@/config/constants'
import { clampZoom, computeFitZoom } from '@/lib/zoomMath'
import { FitWidthIcon, FitPageIcon } from './zoomUtils'
import type { PageDef } from '@/types'

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]

interface Props {
  zoom: number
  onSetZoom: (zoom: number) => void
  /** Ref to the scrollable container — used to compute fit-width / fit-page zoom */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Active page — used for fit calculations */
  page?: PageDef | null
}

export function ZoomControl({ zoom, onSetZoom, containerRef, page }: Props) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { close(); return }
      if (e instanceof MouseEvent && menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [open, close])

  const commitInput = useCallback((raw: string) => {
    const parsed = parseFloat(raw.replace('%', ''))
    if (!isNaN(parsed) && parsed > 0) onSetZoom(clampZoom(parsed / 100))
    setInputValue(null)
  }, [onSetZoom])

  const handleFitWidth = () => {
    if (containerRef && page) onSetZoom(computeFitZoom(containerRef, page).fitWidth)
    close()
  }

  const handleFitPage = () => {
    if (containerRef && page) onSetZoom(computeFitZoom(containerRef, page).fitPage)
    close()
  }

  const canFit = !!(containerRef && page)
  const displayPct = `${Math.round(zoom * 100)}%`

  return (
    <div className="flex items-center gap-0.5 ml-auto">
      <button
        onClick={() => onSetZoom(clampZoom(zoom - 0.1))}
        disabled={zoom <= ZOOM_MIN}
        title="ズームアウト"
        className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ZoomOut className="w-3 h-3" />
      </button>

      <div className="relative" ref={menuRef}>
        {/* Input + dropdown-toggle combined */}
        <div className="flex items-center border rounded hover:bg-accent/50 transition-colors" style={{ minWidth: 56 }}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue ?? displayPct}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={(e) => {
              setInputValue(String(Math.round(zoom * 100)))
              e.target.select()
              close()
            }}
            onBlur={(e) => commitInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitInput((e.target as HTMLInputElement).value); inputRef.current?.blur() }
              if (e.key === 'Escape') { setInputValue(null); inputRef.current?.blur() }
              e.stopPropagation()
            }}
            aria-label="拡大率"
            className="flex-1 min-w-0 bg-transparent text-[10px] text-center outline-none px-1 py-0.5 cursor-text"
          />
          <button
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="px-0.5 py-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>

        {open && (
          <div className="absolute bottom-6 right-0 bg-popover border rounded shadow-lg z-50 py-1 min-w-[80px]">
            {ZOOM_PRESETS.map((z) => (
              <button
                key={z}
                className={cn(
                  'w-full text-left px-3 py-1 text-xs hover:bg-accent',
                  zoom === z && 'bg-accent font-medium',
                )}
                onClick={() => { onSetZoom(z); close() }}
              >
                {Math.round(z * 100)}%
              </button>
            ))}
            {canFit && (
              <>
                <div className="border-t my-1" />
                <button
                  title="横幅フィット"
                  className="w-full flex justify-center px-3 py-1.5 hover:bg-accent"
                  onClick={handleFitWidth}
                >
                  <FitWidthIcon />
                </button>
                <button
                  title="ページ全体フィット"
                  className="w-full flex justify-center px-3 py-1.5 hover:bg-accent"
                  onClick={handleFitPage}
                >
                  <FitPageIcon />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => onSetZoom(clampZoom(zoom + 0.1))}
        disabled={zoom >= ZOOM_MAX}
        title="ズームイン"
        className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ZoomIn className="w-3 h-3" />
      </button>
    </div>
  )
}
