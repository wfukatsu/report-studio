import { useCallback, useRef } from 'react'
import type { FormTableElement } from '@/types'

/**
 * Table-specific undo/redo stack.
 * On exit from table edit mode, all changes collapse into a single
 * store-level pushHistory() call.
 */
export function useTableUndoStack(
  element: FormTableElement,
  onChange: (patch: Partial<FormTableElement>) => void,
) {
  const stackRef = useRef<string[]>([])
  const indexRef = useRef(-1)
  const initialRef = useRef<string | null>(null)

  /** Initialize the undo stack with the current element state */
  const init = useCallback(() => {
    const snapshot = JSON.stringify({
      columns: element.columns,
      rows: element.rows,
    })
    initialRef.current = snapshot
    stackRef.current = [snapshot]
    indexRef.current = 0
  }, [element])

  /** Push current state as a new undo entry */
  const push = useCallback(() => {
    const snapshot = JSON.stringify({
      columns: element.columns,
      rows: element.rows,
    })

    // Don't push if identical to current top
    if (stackRef.current[indexRef.current] === snapshot) return

    // Trim any forward history
    stackRef.current = stackRef.current.slice(0, indexRef.current + 1)
    stackRef.current.push(snapshot)
    // Cap at 50 entries
    if (stackRef.current.length > 50) {
      stackRef.current = stackRef.current.slice(-50)
    }
    indexRef.current = stackRef.current.length - 1
  }, [element])

  /** Undo — restore previous state */
  const undo = useCallback(() => {
    if (indexRef.current <= 0) return false

    indexRef.current -= 1
    const snapshot = JSON.parse(stackRef.current[indexRef.current])
    onChange({
      columns: snapshot.columns,
      rows: snapshot.rows,
    })
    return true
  }, [onChange])

  /** Redo — restore next state */
  const redo = useCallback(() => {
    if (indexRef.current >= stackRef.current.length - 1) return false

    indexRef.current += 1
    const snapshot = JSON.parse(stackRef.current[indexRef.current])
    onChange({
      columns: snapshot.columns,
      rows: snapshot.rows,
    })
    return true
  }, [onChange])

  /** Check if there were any changes since init */
  const hasChanges = useCallback(() => {
    if (!initialRef.current) return false
    const current = JSON.stringify({
      columns: element.columns,
      rows: element.rows,
    })
    return current !== initialRef.current
  }, [element])

  return { init, push, undo, redo, hasChanges }
}
