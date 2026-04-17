import { useCallback, useRef } from 'react'
import type { FormTableElement, FormTableCell } from '@/types'

interface CellData {
  type: FormTableCell['type']
  text?: string
  placeholder?: string
  fieldKey?: string
}

interface ClipboardState {
  cells: CellData[][]  // [row][col]
  width: number
  height: number
}

/**
 * Hook for table cell copy/cut/paste.
 * Supports internal clipboard and external TSV (Excel) paste.
 */
export function useTableClipboard(
  element: FormTableElement,
  selectedCells: Set<string>,
  activeCell: string | null,
  onChange: (patch: Partial<FormTableElement>) => void,
) {
  const clipboardRef = useRef<ClipboardState | null>(null)

  /** Find the bounding rectangle of selected cells */
  const getSelectionBounds = useCallback(() => {
    let minRow = Infinity, maxRow = -1, minCol = Infinity, maxCol = -1

    for (let r = 0; r < element.rows.length; r++) {
      for (let c = 0; c < element.rows[r].cells.length; c++) {
        if (selectedCells.has(element.rows[r].cells[c].id)) {
          minRow = Math.min(minRow, r)
          maxRow = Math.max(maxRow, r)
          minCol = Math.min(minCol, c)
          maxCol = Math.max(maxCol, c)
        }
      }
    }

    if (maxRow === -1) return null
    return { minRow, maxRow, minCol, maxCol }
  }, [element, selectedCells])

  /** Copy selected cells to internal clipboard */
  const copy = useCallback(() => {
    const bounds = getSelectionBounds()
    if (!bounds) return

    const { minRow, maxRow, minCol, maxCol } = bounds
    const cells: CellData[][] = []

    for (let r = minRow; r <= maxRow; r++) {
      const row: CellData[] = []
      for (let c = minCol; c <= maxCol; c++) {
        const cell = element.rows[r]?.cells[c]
        if (cell) {
          row.push({
            type: cell.type,
            text: cell.text,
            placeholder: cell.placeholder,
            fieldKey: cell.fieldKey,
          })
        } else {
          row.push({ type: 'label', text: '' })
        }
      }
      cells.push(row)
    }

    clipboardRef.current = {
      cells,
      width: maxCol - minCol + 1,
      height: maxRow - minRow + 1,
    }

    // Also copy as TSV to system clipboard for cross-app compatibility
    const tsv = cells
      .map((row) =>
        row.map((cell) => cell.text ?? cell.placeholder ?? cell.fieldKey ?? '').join('\t'),
      )
      .join('\n')

    navigator.clipboard.writeText(tsv).catch(() => {
      // Silent fail — system clipboard may not be available
    })
  }, [element, getSelectionBounds])

  /** Cut = copy + clear selected cells */
  const cut = useCallback(() => {
    copy()
    // Clear selected cells
    const rows = element.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => {
        if (selectedCells.has(cell.id)) {
          return { ...cell, type: 'label' as const, text: '' }
        }
        return cell
      }),
    }))
    onChange({ rows })
  }, [copy, element, selectedCells, onChange])

  /** Paste from internal clipboard or system clipboard (TSV) */
  const paste = useCallback(async () => {
    // Find the paste target (active cell position)
    let startRow = -1, startCol = -1
    for (let r = 0; r < element.rows.length; r++) {
      for (let c = 0; c < element.rows[r].cells.length; c++) {
        if (element.rows[r].cells[c].id === activeCell) {
          startRow = r
          startCol = c
          break
        }
      }
      if (startRow !== -1) break
    }
    if (startRow === -1) return

    // Try system clipboard first (handles Excel paste)
    let pasteData: CellData[][] | null = null

    try {
      const text = await navigator.clipboard.readText()
      if (text && text.includes('\t')) {
        // Parse TSV
        pasteData = text.split('\n').filter(Boolean).map((line) =>
          line.split('\t').map((val): CellData => ({
            type: 'label',
            text: val,
          })),
        )
      }
    } catch {
      // System clipboard not available, fall through to internal
    }

    // Fall back to internal clipboard
    if (!pasteData && clipboardRef.current) {
      pasteData = clipboardRef.current.cells
    }

    if (!pasteData || pasteData.length === 0) return

    // Apply paste data, truncating at table boundaries
    const rows = element.rows.map((row, ri) => ({
      ...row,
      cells: row.cells.map((cell, ci): FormTableCell => {
        const pasteRow = ri - startRow
        const pasteCol = ci - startCol
        if (pasteRow >= 0 && pasteRow < pasteData!.length) {
          const pasteRowData = pasteData![pasteRow]
          if (pasteCol >= 0 && pasteCol < pasteRowData.length) {
            const pd = pasteRowData[pasteCol]
            return {
              ...cell,
              id: cell.id, // Keep original ID
              type: pd.type,
              text: pd.text,
              placeholder: pd.placeholder,
              fieldKey: pd.fieldKey,
            }
          }
        }
        return cell
      }),
    }))

    onChange({ rows })
  }, [element, activeCell, onChange])

  return { copy, cut, paste }
}
