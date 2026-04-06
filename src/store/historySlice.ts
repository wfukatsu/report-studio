/**
 * History slice — undo/redo page layout snapshots.
 * Does NOT snapshot calculationRules or dataSources (too expensive).
 */

import type { StateCreator } from 'zustand'
import type { StoreState, HistoryEntry } from './types'
import type { PageDef } from '@/types'

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

/**
 * Create a history entry snapshot from current pages.
 * Must use JSON.parse/JSON.stringify (not structuredClone) because this may be
 * called inside an immer produce callback where pages is an immer Proxy.
 */
export function snapshotPages(pages: PageDef[]): HistoryEntry {
  return { pages: JSON.parse(JSON.stringify(pages)) as PageDef[] }
}

/**
 * Push a new history entry onto the stack.
 * Trims any forward history (redo branch) and caps to 50 entries.
 * Call this inside immer produce after a structural change.
 */
export function pushHistoryEntry(
  history: HistoryEntry[],
  historyIndex: number,
  pages: PageDef[],
): { history: HistoryEntry[]; historyIndex: number } {
  const entry = snapshotPages(pages)
  const trimmed = history.slice(0, historyIndex + 1)
  const next = [...trimmed, entry].slice(-50)
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
    const result = pushHistoryEntry(history, historyIndex, definition.pages)
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
      // structuredClone is safe here — entry.pages is a plain JS object (not immer Proxy)
      s.definition.pages = structuredClone(entry.pages)
      s.historyIndex -= 1
    })
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const entry = history[historyIndex + 1]
    set((s) => {
      s.definition.pages = structuredClone(entry.pages)
      s.historyIndex += 1
    })
  },
})
