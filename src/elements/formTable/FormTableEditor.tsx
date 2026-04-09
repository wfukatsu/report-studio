import { memo, useReducer, useCallback, useEffect, useRef, useState } from 'react'
import type { FormTableElement } from '@/types'
import { FormTableRenderer, gridTemplateColumns } from './Renderer'
import { CellPopover } from './CellPopover'
import { TableContextMenu } from './TableContextMenu'
import { TableToolbar } from './TableToolbar'
import { useTableResize } from './hooks/useTableResize'
import { useTableClipboard } from './hooks/useTableClipboard'
import { useTableUndoStack } from './hooks/useTableUndoStack'
import {
  tableEditReducer,
  INITIAL_TABLE_EDIT_STATE,
  type CellCoord,
} from './tableEditState'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  element: FormTableElement
  records?: Record<string, unknown>[]
  onChange: (patch: Partial<FormTableElement>) => void
  onExitEditMode: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find cell coord (row index, col index) from cell id */
function findCellCoord(
  el: FormTableElement,
  cellId: string,
): CellCoord | null {
  for (let r = 0; r < el.rows.length; r++) {
    for (let c = 0; c < el.rows[r].cells.length; c++) {
      if (el.rows[r].cells[c]?.id === cellId) {
        return { row: r, col: c }
      }
    }
  }
  return null
}

/** Get cell ID at a given coordinate */
function cellIdAt(el: FormTableElement, coord: CellCoord): string | null {
  return el.rows[coord.row]?.cells[coord.col]?.id ?? null
}

/** Get all cell IDs in a rectangular range */
function getCellIdsInRange(
  el: FormTableElement,
  anchor: CellCoord,
  end: CellCoord,
): Set<string> {
  const minRow = Math.min(anchor.row, end.row)
  const maxRow = Math.max(anchor.row, end.row)
  const minCol = Math.min(anchor.col, end.col)
  const maxCol = Math.max(anchor.col, end.col)
  const ids = new Set<string>()
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const id = el.rows[r]?.cells[c]?.id
      if (id) ids.add(id)
    }
  }
  return ids
}

// ---------------------------------------------------------------------------
// FormTableEditor
// ---------------------------------------------------------------------------

export const FormTableEditor = memo(function FormTableEditor({
  element: el,
  records,
  onChange,
  onExitEditMode,
}: Props) {
  const [state, dispatch] = useReducer(
    tableEditReducer,
    INITIAL_TABLE_EDIT_STATE,
  )
  const containerRef = useRef<HTMLDivElement>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [ctxMenuCoord, setCtxMenuCoord] = useState<CellCoord | null>(null)

  // Resize
  const { startColumnResize, startRowResize } = useTableResize(el, onChange)

  // Clipboard
  const { copy, cut, paste } = useTableClipboard(
    el,
    state.selectedCells,
    state.activeCell,
    onChange,
  )

  // Undo stack
  const undoStack = useTableUndoStack(el, onChange)

  // Initialize undo stack on mount
  useEffect(() => {
    undoStack.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------- Click outside to exit -------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        // Push undo snapshot before exiting if there are changes
        undoStack.push()
        onExitEditMode()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onExitEditMode, undoStack])

  // ------- Keyboard handler -------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation() // Prevent canvas-level key handlers

      const isMod = e.metaKey || e.ctrlKey

      // Clipboard shortcuts
      if (isMod && e.key === 'c') {
        e.preventDefault()
        copy()
        return
      }
      if (isMod && e.key === 'x') {
        e.preventDefault()
        cut()
        undoStack.push()
        return
      }
      if (isMod && e.key === 'v') {
        e.preventDefault()
        paste().then(() => undoStack.push())
        return
      }

      // Undo/Redo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoStack.undo()
        return
      }
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        undoStack.redo()
        return
      }

      if (e.key === 'Escape') {
        if (state.mode === 'editing') {
          dispatch({ type: 'STOP_EDITING' })
        } else {
          onExitEditMode()
        }
        return
      }

      // Keyboard navigation (selecting mode)
      if (state.mode === 'selecting' && state.activeCell) {
        const coord = findCellCoord(el, state.activeCell)
        if (!coord) return

        let nextCoord: CellCoord | null = null

        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault()
            if (coord.row > 0) nextCoord = { row: coord.row - 1, col: coord.col }
            break
          case 'ArrowDown':
            e.preventDefault()
            if (coord.row < el.rows.length - 1) nextCoord = { row: coord.row + 1, col: coord.col }
            break
          case 'ArrowLeft':
            e.preventDefault()
            if (coord.col > 0) nextCoord = { row: coord.row, col: coord.col - 1 }
            break
          case 'ArrowRight':
            e.preventDefault()
            if (coord.col < el.columns.length - 1) nextCoord = { row: coord.row, col: coord.col + 1 }
            break
          case 'Tab': {
            e.preventDefault()
            const nextCol = e.shiftKey ? coord.col - 1 : coord.col + 1
            if (nextCol >= 0 && nextCol < el.columns.length) {
              nextCoord = { row: coord.row, col: nextCol }
            } else if (!e.shiftKey && coord.row < el.rows.length - 1) {
              nextCoord = { row: coord.row + 1, col: 0 }
            } else if (e.shiftKey && coord.row > 0) {
              nextCoord = { row: coord.row - 1, col: el.columns.length - 1 }
            }
            break
          }
          case 'Enter':
            e.preventDefault()
            dispatch({ type: 'START_EDITING', cellId: state.activeCell })
            return
        }

        if (nextCoord) {
          // Skip merged cells
          const cell = el.rows[nextCoord.row]?.cells[nextCoord.col]
          if (cell?.mergedInto) {
            // Find the merge target instead
            const targetCoord = findCellCoord(el, cell.mergedInto)
            if (targetCoord) nextCoord = targetCoord
          }

          const nextCellId = cellIdAt(el, nextCoord)
          if (nextCellId) {
            if (e.shiftKey && (e.key.startsWith('Arrow'))) {
              // Range extend
              const ids = getCellIdsInRange(
                el,
                state.selectionAnchor ?? coord,
                nextCoord,
              )
              dispatch({ type: 'SET_SELECTED_CELLS', cellIds: ids })
            } else {
              dispatch({ type: 'MOVE_ACTIVE', coord: nextCoord, cellId: nextCellId })
            }
          }
        }
      }
    },
    [state.mode, state.activeCell, state.selectionAnchor, el, onExitEditMode, copy, cut, paste, undoStack],
  )

  // ------- Cell click -------
  const handleCellClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-cell-id]')
      if (!target) return

      const cellId = target.getAttribute('data-cell-id')
      const rowIdx = Number(target.getAttribute('data-row-idx'))
      const colIdx = Number(target.getAttribute('data-col-idx'))
      if (!cellId) return

      const coord: CellCoord = { row: rowIdx, col: colIdx }

      if (e.shiftKey && state.selectionAnchor) {
        // Range selection
        const ids = getCellIdsInRange(el, state.selectionAnchor, coord)
        dispatch({ type: 'SET_SELECTED_CELLS', cellIds: ids })
      } else {
        dispatch({ type: 'SELECT_CELL', cellId, coord })
      }
    },
    [el, state.selectionAnchor],
  )

  // ------- Cell double-click → edit -------
  const handleCellDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-cell-id]')
      if (!target) return
      const cellId = target.getAttribute('data-cell-id')
      if (!cellId) return

      dispatch({ type: 'START_EDITING', cellId })
    },
    [],
  )

  // ------- Context menu -------
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = (e.target as HTMLElement).closest('[data-cell-id]')
      if (!target) return

      const cellId = target.getAttribute('data-cell-id')
      const rowIdx = Number(target.getAttribute('data-row-idx'))
      const colIdx = Number(target.getAttribute('data-col-idx'))
      if (!cellId) return

      const coord: CellCoord = { row: rowIdx, col: colIdx }
      dispatch({ type: 'SELECT_CELL', cellId, coord })
      setCtxMenu({ x: e.clientX, y: e.clientY })
      setCtxMenuCoord(coord)
    },
    [],
  )

  const handleCloseCtxMenu = useCallback(() => {
    setCtxMenu(null)
    setCtxMenuCoord(null)
  }, [])

  // ------- Render -------
  const isEditing = state.mode !== 'none'

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        outline: '2px solid #3b82f6',
        outlineOffset: '1px',
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="grid"
      aria-label="テーブル編集"
    >
      {/* Toolbar */}
      {isEditing && (
        <TableToolbar
          element={el}
          selectedCells={state.selectedCells}
          activeCell={state.activeCell}
          onChange={onChange}
        />
      )}

      {/* Base table rendering */}
      <div
        onClick={handleCellClick}
        onDoubleClick={handleCellDoubleClick}
        onContextMenu={handleContextMenu}
        style={{ width: '100%', height: '100%', cursor: 'cell' }}
      >
        <FormTableRenderer element={el} records={records} />
      </div>

      {/* Selection overlay */}
      {isEditing && state.selectedCells.size > 0 && (
        <SelectionOverlay
          element={el}
          selectedCells={state.selectedCells}
          activeCell={state.activeCell}
        />
      )}

      {/* Resize handles */}
      {isEditing && (
        <ResizeHandles
          element={el}
          onStartColumnResize={startColumnResize}
          onStartRowResize={startRowResize}
        />
      )}

      {/* Cell editing popover */}
      {state.mode === 'editing' && state.activeCell && (
        <CellPopover
          element={el}
          cellId={state.activeCell}
          onChange={onChange}
          onClose={() => dispatch({ type: 'STOP_EDITING' })}
        />
      )}

      {/* Context menu */}
      <TableContextMenu
        element={el}
        menu={ctxMenu}
        cellCoord={ctxMenuCoord}
        onChange={onChange}
        onClose={handleCloseCtxMenu}
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Selection overlay — highlights selected cells
// ---------------------------------------------------------------------------

function SelectionOverlay({
  element: el,
  selectedCells,
  activeCell,
}: {
  element: FormTableElement
  selectedCells: Set<string>
  activeCell: string | null
}) {
  // Collect selected cell positions from data attributes in the DOM
  // We use a lightweight approach: overlay absolute-positioned highlights
  // keyed by cell ID, rendered by scanning element data
  const highlights: React.ReactElement[] = []

  el.rows.forEach((row, rowIdx) => {
    row.cells.forEach((cell, colIdx) => {
      if (!selectedCells.has(cell.id)) return
      if (cell.mergedInto) return

      const isActive = cell.id === activeCell

      highlights.push(
        <div
          key={cell.id}
          style={{
            position: 'absolute',
            // Position will be calculated via CSS Grid overlay approach
            // For now, use data-driven positioning
            gridColumn: `${colIdx + 1} / span ${cell.colspan ?? 1}`,
            gridRow: `${rowIdx + 1} / span ${cell.rowspan ?? 1}`,
            background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
            border: isActive ? '2px solid #3b82f6' : '1px solid rgba(59, 130, 246, 0.3)',
            pointerEvents: 'none',
            boxSizing: 'border-box',
            borderRadius: 1,
          }}
        />,
      )
    })
  })

  if (highlights.length === 0) return null

  // Render overlay grid that matches the table layout
  const allRows = el.rows
  const gridRows = allRows.map((r) => `${r.height}mm`).join(' ')

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: gridTemplateColumns(el),
        gridTemplateRows: gridRows,
        pointerEvents: 'none',
        zIndex: 50,
        // Account for outer border
        border: `${el.borderWidth ?? 0.3}mm solid transparent`,
        boxSizing: 'border-box',
      }}
    >
      {highlights}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resize handles — column and row border drag handles
// ---------------------------------------------------------------------------

function ResizeHandles({
  element: el,
  onStartColumnResize,
  onStartRowResize,
}: {
  element: FormTableElement
  onStartColumnResize: (e: React.PointerEvent, colIdx: number) => void
  onStartRowResize: (e: React.PointerEvent, rowIdx: number) => void
}) {
  // Column resize handles — positioned at column boundaries
  const colHandles: React.ReactElement[] = []
  let xOffset = 0
  for (let i = 0; i < el.columns.length - 1; i++) {
    xOffset += el.columns[i].width
    const left = `${xOffset}mm`
    colHandles.push(
      <div
        key={`col-${i}`}
        style={{
          position: 'absolute',
          left,
          top: 0,
          bottom: 0,
          width: 6,
          marginLeft: -3,
          cursor: 'col-resize',
          zIndex: 55,
        }}
        onPointerDown={(e) => onStartColumnResize(e, i)}
      >
        <div
          style={{
            position: 'absolute',
            left: 2,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'transparent',
            transition: 'background 0.15s',
          }}
          className="resize-handle-line"
        />
      </div>,
    )
  }

  // Row resize handles — positioned at row boundaries
  const rowHandles: React.ReactElement[] = []
  let yOffset = 0
  for (let i = 0; i < el.rows.length - 1; i++) {
    yOffset += el.rows[i].height
    const top = `${yOffset}mm`
    rowHandles.push(
      <div
        key={`row-${i}`}
        style={{
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          height: 6,
          marginTop: -3,
          cursor: 'row-resize',
          zIndex: 55,
        }}
        onPointerDown={(e) => onStartRowResize(e, i)}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 0,
            right: 0,
            height: 2,
            background: 'transparent',
            transition: 'background 0.15s',
          }}
          className="resize-handle-line"
        />
      </div>,
    )
  }

  return (
    <>
      {colHandles}
      {rowHandles}
    </>
  )
}
