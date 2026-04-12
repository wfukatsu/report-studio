import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react'
import { useReportStore } from '@/store'
import type { DataSourceNode } from '@/store/dataBrowserSlice'
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
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

interface Props {
  source: DataSourceNode
}

type LoadState = 'idle' | 'loading' | 'error' | 'ok'

export function DataGrid({ source }: Props) {
  const searchQuery = useReportStore((s) => s.dataBrowserSearchQuery)
  const setSearch = useReportStore((s) => s.setDataBrowserSearch)
  const sortCol = useReportStore((s) => s.dataBrowserSortCol)
  const sortDir = useReportStore((s) => s.dataBrowserSortDir)
  const setSort = useReportStore((s) => s.setDataBrowserSort)
  const currentPage = useReportStore((s) => s.dataBrowserCurrentPage)
  const setPage = useReportStore((s) => s.setDataBrowserPage)
  const detailRow = useReportStore((s) => s.dataBrowserDetailRow)
  const setDetailRow = useReportStore((s) => s.setDataBrowserDetailRow)
  const cacheScalarDbScan = useReportStore((s) => s.cacheScalarDbScan)

  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [scalarDbData, setScalarDbData] = useState<ScalarDbScanResponse | null>(null)
  const [productRows, setProductRows] = useState<Record<string, unknown>[]>([])
  const [formRows, setFormRows] = useState<Record<string, unknown>[]>([])
  const [formTotal, setFormTotal] = useState(0)
  const [columns, setColumns] = useState<string[]>([])

  // Load data when source changes or page changes
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
          setColumns(data.columns.map((c) => c.name).filter((k) => !FORBIDDEN_KEYS.has(k)))
          cacheScalarDbScan(source.namespace, source.table, offset, data)
          setLoadState('ok')
        })
        .catch((e) => {
          if (cancelled) return
          setErrorMsg(e instanceof Error ? e.message : 'データの読み込みに失敗しました')
          setLoadState('error')
        })

    } else if (source.kind === 'product-master') {
      getProducts()
        .then((products) => {
          if (cancelled) return
          const cols = ['code', 'name', 'unitPrice', 'category', 'taxType', 'unit', 'manufacturer', 'stockCount', 'description']
          setColumns(cols)
          setProductRows(products.map((p) => ({
            id: p.id, code: p.code, name: p.name, unitPrice: p.unitPrice,
            category: p.category, taxType: p.taxType, unit: p.unit,
            manufacturer: p.manufacturer, stockCount: p.stockCount, description: p.description,
            subscriptionPeriod: p.subscriptionPeriod, subscriptionPriceUnit: p.subscriptionPriceUnit,
            _product: p, // keep full product for detail panel
          })))
          setLoadState('ok')
        })
        .catch(() => {
          if (cancelled) return
          setErrorMsg('商品データの読み込みに失敗しました')
          setLoadState('error')
        })

    } else if (source.kind === 'form-responses') {
      const offset = currentPage * PAGE_SIZE
      listResponses(source.templateId, { offset, limit: PAGE_SIZE })
        .then((data) => {
          if (cancelled) return
          setFormTotal(data.total)
          const cols = ['submittedAt', 'submittedBy', 'summary']
          setColumns(cols)
          setFormRows(data.items.map((r) => ({
            submittedAt: new Date(r.submittedAt).toLocaleString('ja-JP'),
            submittedBy: r.submittedBy,
            summary: r.summary.join(', '),
          })))
          setLoadState('ok')
        })
        .catch(() => {
          if (cancelled) return
          setErrorMsg('回答データの読み込みに失敗しました')
          setLoadState('error')
        })
    }

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, currentPage])

  // Raw rows depending on source
  const rawRows: Record<string, unknown>[] = useMemo(() => {
    if (source.kind === 'scalardb-table') return scalarDbData?.rows ?? []
    if (source.kind === 'product-master') return productRows
    return formRows
  }, [source, scalarDbData, productRows, formRows])

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

  // Pagination totals
  const totalRows = source.kind === 'form-responses' ? formTotal : (scalarDbData?.total ?? sortedRows.length)
  const totalPages = Math.max(1, Math.ceil(
    source.kind === 'form-responses' || source.kind === 'scalardb-table'
      ? totalRows / PAGE_SIZE
      : sortedRows.length / PAGE_SIZE
  ))
  // For client-paginated sources (product master)
  const displayRows = source.kind === 'product-master'
    ? sortedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
    : sortedRows

  function handleSort(col: string) {
    if (sortCol === col) {
      setSort(col, sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(col, 'asc')
    }
  }

  function handleExportCsv() {
    const now = new Date().toISOString().slice(0, 10)
    const name = source.kind === 'scalardb-table'
      ? `${source.namespace}_${source.table}_${now}.csv`
      : source.kind === 'product-master'
        ? `product_master_${now}.csv`
        : `responses_${source.templateId}_${now}.csv`
    exportToCsv(columns, displayRows, name)
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
              onClick={() => setPage(currentPage)} // re-trigger effect
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
                  onClick={() => setDetailRow(row)}
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
          isProductMaster={source.kind === 'product-master'}
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
