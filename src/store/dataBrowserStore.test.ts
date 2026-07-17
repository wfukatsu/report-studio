import { describe, it, expect, beforeEach } from 'vitest'
import { useDataBrowserStore } from './dataBrowserStore'
import type { DataSourceNode } from './dataBrowserStore'

const TABLE_NODE: DataSourceNode = { kind: 'scalardb-table', namespace: 'ns1', table: 'orders' }
const FORM_NODE: DataSourceNode = { kind: 'form-responses', templateId: 'tpl-1', templateName: '見積書' }

beforeEach(() => {
  useDataBrowserStore.setState({
    selectedSource: null,
    searchQuery: '',
    sortCol: null,
    sortDir: 'asc',
    currentPage: 0,
    detailRow: null,
  })
})

describe('dataBrowserStore — setSource', () => {
  it('selects the given source', () => {
    useDataBrowserStore.getState().setSource(TABLE_NODE)
    expect(useDataBrowserStore.getState().selectedSource).toEqual(TABLE_NODE)
  })

  it('resets search, sort, page and detail row when the source changes', () => {
    useDataBrowserStore.setState({
      searchQuery: 'abc',
      sortCol: 'name',
      sortDir: 'desc',
      currentPage: 3,
      detailRow: { id: 1 },
    })
    useDataBrowserStore.getState().setSource(FORM_NODE)
    const s = useDataBrowserStore.getState()
    expect(s.selectedSource).toEqual(FORM_NODE)
    expect(s.searchQuery).toBe('')
    expect(s.sortCol).toBeNull()
    expect(s.sortDir).toBe('asc')
    expect(s.currentPage).toBe(0)
    expect(s.detailRow).toBeNull()
  })

  it('accepts null to clear the selection', () => {
    useDataBrowserStore.getState().setSource(TABLE_NODE)
    useDataBrowserStore.getState().setSource(null)
    expect(useDataBrowserStore.getState().selectedSource).toBeNull()
  })
})

describe('dataBrowserStore — setSearch', () => {
  it('updates the query and resets page + detail row', () => {
    useDataBrowserStore.setState({ currentPage: 2, detailRow: { id: 1 } })
    useDataBrowserStore.getState().setSearch('foo')
    const s = useDataBrowserStore.getState()
    expect(s.searchQuery).toBe('foo')
    expect(s.currentPage).toBe(0)
    expect(s.detailRow).toBeNull()
  })

  it('does not touch the sort state', () => {
    useDataBrowserStore.getState().setSort('price', 'desc')
    useDataBrowserStore.getState().setSearch('foo')
    const s = useDataBrowserStore.getState()
    expect(s.sortCol).toBe('price')
    expect(s.sortDir).toBe('desc')
  })
})

describe('dataBrowserStore — setSort', () => {
  it('sets the sort column and direction', () => {
    useDataBrowserStore.getState().setSort('name', 'desc')
    const s = useDataBrowserStore.getState()
    expect(s.sortCol).toBe('name')
    expect(s.sortDir).toBe('desc')
  })

  it('accepts null to clear sorting', () => {
    useDataBrowserStore.getState().setSort('name', 'desc')
    useDataBrowserStore.getState().setSort(null, 'asc')
    expect(useDataBrowserStore.getState().sortCol).toBeNull()
  })
})

describe('dataBrowserStore — setPage / setDetailRow', () => {
  it('setPage updates the page and closes the detail row', () => {
    useDataBrowserStore.setState({ detailRow: { id: 1 } })
    useDataBrowserStore.getState().setPage(4)
    const s = useDataBrowserStore.getState()
    expect(s.currentPage).toBe(4)
    expect(s.detailRow).toBeNull()
  })

  it('setDetailRow opens and closes the detail row', () => {
    useDataBrowserStore.getState().setDetailRow({ id: 7, name: 'x' })
    expect(useDataBrowserStore.getState().detailRow).toEqual({ id: 7, name: 'x' })
    useDataBrowserStore.getState().setDetailRow(null)
    expect(useDataBrowserStore.getState().detailRow).toBeNull()
  })
})
