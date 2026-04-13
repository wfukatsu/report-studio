/**
 * History slice — undo/redo snapshots covering page layout, schema, and rules.
 */

import type { StateCreator } from 'zustand'
import type { StoreState, HistoryEntry } from './types'
import type { PageDef, SchemaDefinition, CalculationRule, ValidationRule } from '@/types'

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

/**
 * Create a history entry snapshot.
 * Must use JSON.parse/JSON.stringify (not structuredClone) because this may be
 * called inside an immer produce callback where state is an immer Proxy.
 */
export function snapshotPages(
  pages: PageDef[],
  schema?: SchemaDefinition,
  calculationRules?: CalculationRule[],
  validationRules?: ValidationRule[],
): HistoryEntry {
  return JSON.parse(JSON.stringify({
    pages,
    schema,
    calculationRules,
    validationRules,
  })) as HistoryEntry
}

/**
 * Push a new history entry onto the stack.
 * Trims any forward history (redo branch) and caps to 30 entries
 * (reduced from 50 to account for the larger snapshot size with schema/rules).
 */
export function pushHistoryEntry(
  history: HistoryEntry[],
  historyIndex: number,
  pages: PageDef[],
  schema?: SchemaDefinition,
  calculationRules?: CalculationRule[],
  validationRules?: ValidationRule[],
): { history: HistoryEntry[]; historyIndex: number } {
  const entry = snapshotPages(pages, schema, calculationRules, validationRules)
  const trimmed = history.slice(0, historyIndex + 1)
  const next = [...trimmed, entry].slice(-30)
  return { history: next, historyIndex: next.length - 1 }
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export type HistorySlice = Pick<StoreState,
  | 'history'
  | 'historyIndex'
  | 'undo'
  | 'redo'
  | 'pushHistory'
>

export const createHistorySlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  HistorySlice
> = (set, get) => ({
  history: [],
  historyIndex: -1,

  pushHistory: () => {
    const { history, historyIndex, definition } = get()
    const result = pushHistoryEntry(
      history,
      historyIndex,
      definition.pages,
      definition.schema,
      definition.calculationRules,
      definition.validationRules,
    )
    set((s) => {
      s.history = result.history
      s.historyIndex = result.historyIndex
    })
  },

  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex < 1) return
    const entry = history[historyIndex - 1]
    set((s) => {
      // structuredClone is safe here — entry values are plain JS objects (not immer Proxies)
      s.definition.pages = structuredClone(entry.pages)
      if (entry.schema !== undefined) s.definition.schema = structuredClone(entry.schema)
      if (entry.calculationRules !== undefined) s.definition.calculationRules = structuredClone(entry.calculationRules)
      if (entry.validationRules !== undefined) s.definition.validationRules = structuredClone(entry.validationRules)
      s.historyIndex -= 1
    })
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const entry = history[historyIndex + 1]
    set((s) => {
      s.definition.pages = structuredClone(entry.pages)
      if (entry.schema !== undefined) s.definition.schema = structuredClone(entry.schema)
      if (entry.calculationRules !== undefined) s.definition.calculationRules = structuredClone(entry.calculationRules)
      if (entry.validationRules !== undefined) s.definition.validationRules = structuredClone(entry.validationRules)
      s.historyIndex += 1
    })
  },
})
