import { useCallback, useRef, useEffect, useState } from 'react'
import type { FormTableElement } from '@/types'
import { pxToMm } from '@/lib/paperSizes'
import { updateColumn, updateRow } from '../tableOperations'

const MIN_SIZE_MM = 3

interface ResizeState {
  type: 'column' | 'row'
  index: number
  startPx: number
  startSizeMm: number
}

/**
 * Hook for column width and row height drag-resize.
 * Returns handlers to attach to the resize handles and current drag state.
 */
export function useTableResize(
  element: FormTableElement,
  onChange: (patch: Partial<FormTableElement>) => void,
) {
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const startColumnResize = useCallback(
    (e: React.PointerEvent, colIdx: number) => {
      e.stopPropagation()
      e.preventDefault()
      const state: ResizeState = {
        type: 'column',
        index: colIdx,
        startPx: e.clientX,
        startSizeMm: element.columns[colIdx].width,
      }
      resizeRef.current = state
      setResizing(state)

      const onPointerMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return
        const deltaPx = ev.clientX - resizeRef.current.startPx
        const deltaMm = pxToMm(deltaPx)
        const newWidth = Math.max(MIN_SIZE_MM, resizeRef.current.startSizeMm + deltaMm)
        onChange(updateColumn(element, resizeRef.current.index, { width: Math.round(newWidth * 10) / 10 }))
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        cleanupRef.current = null
      }

      const onPointerUp = () => {
        resizeRef.current = null
        setResizing(null)
        cleanup()
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      cleanupRef.current = cleanup
    },
    [element, onChange],
  )

  const startRowResize = useCallback(
    (e: React.PointerEvent, rowIdx: number) => {
      e.stopPropagation()
      e.preventDefault()
      const state: ResizeState = {
        type: 'row',
        index: rowIdx,
        startPx: e.clientY,
        startSizeMm: element.rows[rowIdx].height,
      }
      resizeRef.current = state
      setResizing(state)

      const onPointerMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return
        const deltaPx = ev.clientY - resizeRef.current.startPx
        const deltaMm = pxToMm(deltaPx)
        const newHeight = Math.max(MIN_SIZE_MM, resizeRef.current.startSizeMm + deltaMm)
        onChange(updateRow(element, resizeRef.current.index, { height: Math.round(newHeight * 10) / 10 }))
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        cleanupRef.current = null
      }

      const onPointerUp = () => {
        resizeRef.current = null
        setResizing(null)
        cleanup()
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      cleanupRef.current = cleanup
    },
    [element, onChange],
  )

  return {
    resizing,
    startColumnResize,
    startRowResize,
  }
}
