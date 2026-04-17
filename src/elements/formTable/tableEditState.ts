/** Grid coordinate (row index, column index) */
export interface CellCoord {
  row: number
  col: number
}

/** Table editing mode — progressive: none → selecting → editing */
export type TableEditMode = 'none' | 'selecting' | 'editing'

/** State for table-level editing within FormTableEditor */
export interface TableEditState {
  /** Current editing mode */
  mode: TableEditMode
  /** Set of selected cell IDs */
  selectedCells: Set<string>
  /** Currently focused (active) cell ID */
  activeCell: string | null
  /** Anchor cell for range selection (Shift+click / drag) */
  selectionAnchor: CellCoord | null
  /** End cell for range selection */
  selectionEnd: CellCoord | null
}

export const INITIAL_TABLE_EDIT_STATE: TableEditState = {
  mode: 'none',
  selectedCells: new Set(),
  activeCell: null,
  selectionAnchor: null,
  selectionEnd: null,
}

// ---------------------------------------------------------------------------
// Reducer actions
// ---------------------------------------------------------------------------

export type TableEditAction =
  | { type: 'SELECT_CELL'; cellId: string; coord: CellCoord }
  | { type: 'RANGE_SELECT'; cellId: string; coord: CellCoord }
  | { type: 'START_EDITING'; cellId: string }
  | { type: 'STOP_EDITING' }
  | { type: 'MOVE_ACTIVE'; coord: CellCoord; cellId: string }
  | { type: 'EXIT_MODE' }
  | { type: 'SET_SELECTED_CELLS'; cellIds: Set<string> }

export function tableEditReducer(
  state: TableEditState,
  action: TableEditAction,
): TableEditState {
  switch (action.type) {
    case 'SELECT_CELL':
      return {
        ...state,
        mode: 'selecting',
        selectedCells: new Set([action.cellId]),
        activeCell: action.cellId,
        selectionAnchor: action.coord,
        selectionEnd: action.coord,
      }

    case 'RANGE_SELECT': {
      // Range selection adds to selection without clearing
      const next = new Set(state.selectedCells)
      next.add(action.cellId)
      return {
        ...state,
        mode: 'selecting',
        selectedCells: next,
        selectionEnd: action.coord,
      }
    }

    case 'START_EDITING':
      return {
        ...state,
        mode: 'editing',
        activeCell: action.cellId,
        selectedCells: new Set([action.cellId]),
      }

    case 'STOP_EDITING':
      return {
        ...state,
        mode: 'selecting',
      }

    case 'MOVE_ACTIVE':
      return {
        ...state,
        mode: 'selecting',
        activeCell: action.cellId,
        selectedCells: new Set([action.cellId]),
        selectionAnchor: action.coord,
        selectionEnd: action.coord,
      }

    case 'EXIT_MODE':
      if (state.mode === 'editing') {
        return { ...state, mode: 'selecting' }
      }
      return INITIAL_TABLE_EDIT_STATE

    case 'SET_SELECTED_CELLS':
      return {
        ...state,
        mode: 'selecting',
        selectedCells: action.cellIds,
      }

    default:
      return state
  }
}
