/**
 * Data Browser slice — UI state for the /data-browser page.
 *
 * Tracks selected data source, search/sort state, and the currently open
 * detail row. This slice is outside the undo/redo history.
 */

import type { StateCreator } from 'zustand'
import type { StoreState } from './types'
// ScalarDbScanResponse used via store types only

// ---------------------------------------------------------------------------
// Data source node types
// ---------------------------------------------------------------------------

export type DataSourceNode =
  | { kind: 'scalardb-table'; namespace: string; table: string }
  | { kind: 'product-master' }
  | { kind: 'form-responses'; templateId: string; templateName: string }

export type DataBrowserSlice = Pick<StoreState,
  | 'dataBrowserSelectedSource'
  | 'dataBrowserSearchQuery'
  | 'dataBrowserSortCol'
  | 'dataBrowserSortDir'
  | 'dataBrowserCurrentPage'
  | 'dataBrowserDetailRow'
  | 'dataBrowserScalarDbCache'
  | 'setDataBrowserSource'
  | 'setDataBrowserSearch'
  | 'setDataBrowserSort'
  | 'setDataBrowserPage'
  | 'setDataBrowserDetailRow'
  | 'cacheScalarDbScan'
>

export const createDataBrowserSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  DataBrowserSlice
> = (set) => ({
  dataBrowserSelectedSource: null,
  dataBrowserSearchQuery: '',
  dataBrowserSortCol: null,
  dataBrowserSortDir: 'asc',
  dataBrowserCurrentPage: 0,
  dataBrowserDetailRow: null,
  dataBrowserScalarDbCache: new Map(),

  setDataBrowserSource: (source) => set((s) => {
    s.dataBrowserSelectedSource = source
    s.dataBrowserSearchQuery = ''
    s.dataBrowserSortCol = null
    s.dataBrowserSortDir = 'asc'
    s.dataBrowserCurrentPage = 0
    s.dataBrowserDetailRow = null
  }),

  setDataBrowserSearch: (query) => set((s) => {
    s.dataBrowserSearchQuery = query
    s.dataBrowserCurrentPage = 0
    s.dataBrowserDetailRow = null
  }),

  setDataBrowserSort: (col, dir) => set((s) => {
    s.dataBrowserSortCol = col
    s.dataBrowserSortDir = dir
  }),

  setDataBrowserPage: (page) => set((s) => {
    s.dataBrowserCurrentPage = page
    s.dataBrowserDetailRow = null
  }),

  setDataBrowserDetailRow: (row) => set((s) => {
    s.dataBrowserDetailRow = row
  }),

  cacheScalarDbScan: (namespace, table, offset, data) => set((s) => {
    const key = `${namespace}.${table}:${offset}`
    const newMap = new Map(s.dataBrowserScalarDbCache)
    newMap.set(key, data)
    s.dataBrowserScalarDbCache = newMap
  }),
})
