import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import type { DataSourceNode } from '@/store/dataBrowserStore'
import type { Product } from '@/types'
import {
  scanScalarDbTable,
  listResponses,
  getProducts,
} from '@/api/reportApi'
import type { ScalarDbScanResponse } from '@/api/reportApi'
import { EmptyState } from './EmptyState'
import { DataGridToolbar, exportToCsv } from './DataGridToolbar'
import { DataDetailPanel } from './DataDetailPanel'

const PAGE_SIZE = 50

// Value type for grid cells — narrower than Record<string, unknown>
type GridRow = Record<string, string | number | boolean | null | undefined>

interface Props {
  source: DataSourceNode
}

type LoadState = 'idle' | 'loading' | 'error' | 'ok'

// Stable string key for a DataSourceNode (avoids object identity instability)
function toSourceKey(source: DataSourceNode): string {
  if (source.kind === 'scalardb-table') return `scalardb:${source.namespace}.${source.table}`
  if (source.kind === 'form-responses') return `form-responses:${source.templateId}`
  return 'product-master'
}

export function DataGrid({ source }: Props) {
  const searchQuery = useDataBrowserStore((s) => s.searchQuery)
  const setSearch = useDataBrowserStore((s) => s.setSearch)
  const sortCol = useDataBrowserStore((s) => s.sortCol)
  const sortDir = useDataBrowserStore((s) => s.sortDir)
  const setSort = useDataBrowserStore((s) => s.setSort)
  const currentPage = useDataBrowserStore((s) => s.currentPage)
  const setPage = useDataBrowserStore((s) => s.setPage)
  const detailRow = useDataBrowserStore((s) => s.detailRow)
  const setDetailRow = useDataBrowserStore((s) => s.setDetailRow)

  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [scalarDbData, setScalarDbData] = useState<ScalarDbScanResponse | null>(null)
  const [productRows, setProductRows] = useState<GridRow[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])  // full objects for detail panel
  const [formRows, setFormRows] = useState<GridRow[]>([])
  const [formTotal, setFormTotal] = useState(0)
  const [columns, setColumns] = useState<string[]>([])

  // Stable source key — prevents useEffect firing on object re-creation
  const sourceKey = toSourceKey(source)

  // Load data when source or page changes
  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    setErrorMsg('')

    if (source.kind === 'scalardb-table') {
      const offset = currentPage * PAGE_SIZE
      scanScalarDbTable(source.namespace, source.table, { offset, limit: PAGE_SIZE })
        .then((data) => {
          if (cancelled) return
          setScalarDbData(data)
          setColumns(data.columns.map((c) => c.name))
          setLoadState('ok')
        })
        .catch((e) => {
          if (cancelled) return
          setErrorMsg(e instanceof Error ? e.message : 'データの読み込みに失敗しました')
          setLoadState('error')
        })

    } else if (source.kind === 'product-master') {
      // Product master: fetch full Product objects; build display rows separately
      getProducts()
        .then((products) => {
          if (cancelled) return
          setAllProducts(products)
          setColumns(['code', 'name', 'unitPrice', 'category', 'taxType', 'unit', 'manufacturer', 'stockCount', 'description'])
          setProductRows(products.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            unitPrice: p.unitPrice,
            category: p.category,
            taxType: p.taxType,
            unit: p.unit,
            manufacturer: p.manufacturer,
            stockCount: p.stockCount,
            description: p.description,
          })))
          setLoadState('ok')
        })
        .catch((e) => {
          if (cancelled) return
          setErrorMsg(e instanceof Error ? e.message : '商品データの読み込みに失敗しました')
          setLoadState('error')
        })

    } else if (source.kind === 'form-responses') {
      const offset = currentPage * PAGE_SIZE
      listResponses(source.templateId, { offset, limit: PAGE_SIZE })
        .then((data) => {
          if (cancelled) return
          setFormTotal(data.total)
          setColumns(['submittedAt', 'submittedBy', 'summary'])
          setFormRows(data.items.map((r) => ({
            submittedAt: new Date(r.submittedAt).toLocaleString('ja-JP'),
            submittedBy: r.submittedBy,
            summary: r.summary.join(', '),
          })))
          setLoadState('ok')
        })
        .catch((e) => {
          if (cancelled) return
          setErrorMsg(e instanceof Error ? e.message : '回答データの読み込みに失敗しました')
          setLoadState('error')
        })
    }

    return () => { cancelled = true }
  }, [sourceKey, currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Find full Product object for the currently selected row (for detail panel)
  const selectedProduct = useMemo<Product | null>(() => {
    if (source.kind !== 'product-master' || !detailRow) return null
    return allProducts.find((p) => p.id === detailRow.id) ?? null
  }, [source.kind, detailRow, allProducts])

  // Raw rows depending on source
  const rawRows: GridRow[] = useMemo(() => {
    if (source.kind === 'scalardb-table') return (scalarDbData?.rows ?? []) as GridRow[]
    if (source.kind === 'product-master') return productRows
    return formRows
  }, [source.kind, scalarDbData, productRows, formRows])

  // Client-side filter & sort
  const filteredRows = useMemo(() => {
    if (!searchQuery) return rawRows
    const q = searchQuery.toLowerCase()
    return rawRows.filter((row) =>
      columns.some((col) => String(row[col] ?? '').toLowerCase().includes(q))
    )
  }, [rawRows, searchQuery, columns])

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''), 'ja')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredRows, sortCol, sortDir])

  // Pagination
  const totalRows = source.kind === 'form-responses' ? formTotal
    : source.kind === 'scalardb-table' ? (scalarDbData?.total ?? 0)
    : sortedRows.length
  const totalPages = Math.max(1, Math.ceil(
    source.kind === 'product-master' ? sortedRows.length / PAGE_SIZE : totalRows / PAGE_SIZE
  ))
  const displayRows = source.kind === 'product-master'
    ? sortedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
    : sortedRows

  function handleSort(col: string) {
    setSort(col, sortCol === col && sortDir === 'asc' ? 'desc' : 'asc')
  }

  function handleExportCsv() {
    const now = new Date().toISOString().slice(0, 10)
    const name = source.kind === 'scalardb-table'
      ? `${source.namespace}_${source.table}_${now}.csv`
      : source.kind === 'product-master'
        ? `product_master_${now}.csv`
        : `responses_${source.templateId}_${now}.csv`
    exportToCsv(columns, displayRows as Record<string, unknown>[], name)
  }

  if (loadState === 'loading') {
    return (
      <div className="flex flex-col h-full">
        <DataGridToolbar searchQuery="" onSearchChange={() => {}} onExportCsv={() => {}} totalRows={0} />
        <EmptyState title="読み込み中..." />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="flex flex-col h-full">
        <DataGridToolbar searchQuery={searchQuery} onSearchChange={setSearch} onExportCsv={() => {}} totalRows={0} />
        <EmptyState
          title="データの読み込みに失敗しました"
          description={errorMsg}
          action={
            <button
              onClick={() => setPage(currentPage)}
              className="px-3 py-1.5 text-xs border rounded hover:bg-accent"
            >
              再試行
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <DataGridToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearch}
        onExportCsv={handleExportCsv}
        totalRows={source.kind === 'product-master' ? sortedRows.length : totalRows}
        truncated={source.kind === 'scalardb-table' && (scalarDbData?.truncated ?? false)}
      />

      <div className="flex-1 overflow-auto">
        {displayRows.length === 0 ? (
          <EmptyState
            title={searchQuery ? `「${searchQuery}」に一致するデータがありません` : 'データがありません'}
          />
        ) : (
          <table className="w-full text-xs min-w-max" aria-label="データグリッド">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap select-none"
                  >
                    <span className="flex items-center gap-1">
                      {col}
                      {sortCol === col && (
                        sortDir === 'asc'
                          ? <ArrowUp className="w-3 h-3" />
                          : <ArrowDown className="w-3 h-3" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayRows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => setDetailRow(row as Record<string, unknown>)}
                  className="hover:bg-muted/30 cursor-pointer"
                >
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-xs truncate">
                      {renderCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-3 py-2 border-t shrink-0 text-xs">
        <span className="text-muted-foreground">
          {currentPage + 1} / {totalPages} ページ
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label="前のページ"
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            aria-label="次のページ"
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail panel */}
      {detailRow && (
        <DataDetailPanel
          row={detailRow}
          columns={columns}
          product={selectedProduct ?? undefined}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  )
}

function renderCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
