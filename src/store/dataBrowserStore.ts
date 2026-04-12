/**
 * Standalone Zustand store for the /data-browser page.
 *
 * Separated from the main reportStore because the data browser has zero
 * interaction with report-editing state. Keeping them apart prevents data
 * browser state changes (e.g. typing in search) from triggering re-renders
 * in the report editor.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type DataSourceNode =
  | { kind: 'scalardb-table'; namespace: string; table: string }
  | { kind: 'product-master' }
  | { kind: 'form-responses'; templateId: string; templateName: string }

interface DataBrowserState {
  selectedSource: DataSourceNode | null
  searchQuery: string
  sortCol: string | null
  sortDir: 'asc' | 'desc'
  currentPage: number
  detailRow: Record<string, unknown> | null
}

interface DataBrowserActions {
  setSource: (source: DataSourceNode | null) => void
  setSearch: (query: string) => void
  setSort: (col: string | null, dir: 'asc' | 'desc') => void
  setPage: (page: number) => void
  setDetailRow: (row: Record<string, unknown> | null) => void
}

type DataBrowserStore = DataBrowserState & DataBrowserActions

export const useDataBrowserStore = create<DataBrowserStore>()(
  immer((set) => ({
    selectedSource: null,
    searchQuery: '',
    sortCol: null,
    sortDir: 'asc',
    currentPage: 0,
    detailRow: null,

    setSource: (source) => set((s) => {
      s.selectedSource = source
      s.searchQuery = ''
      s.sortCol = null
      s.sortDir = 'asc'
      s.currentPage = 0
      s.detailRow = null
    }),

    setSearch: (query) => set((s) => {
      s.searchQuery = query
      s.currentPage = 0
      s.detailRow = null
    }),

    setSort: (col, dir) => set((s) => {
      s.sortCol = col
      s.sortDir = dir
    }),

    setPage: (page) => set((s) => {
      s.currentPage = page
      s.detailRow = null
    }),

    setDetailRow: (row) => set((s) => {
      s.detailRow = row
    }),
  })),
)
