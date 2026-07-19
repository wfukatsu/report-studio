import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Plus, Trash2, FileDown } from 'lucide-react'
import { BulkExportModal } from './BulkExportModal'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import type { DataSourceNode } from '@/store/dataBrowserStore'
import type { Product } from '@/types'
import {
  scanScalarDbTable,
  listResponses,
  getProducts,
  deleteScalarDbRow,
  updateScalarDbRow,
} from '@/api/reportApi'
import type { ScalarDbScanResponse, ScalarDbRowValues } from '@/api/reportApi'
import { EmptyState } from './EmptyState'
import { DataGridToolbar, exportToCsv } from './DataGridToolbar'
import { DataDetailPanel } from './DataDetailPanel'
import { RowEditModal } from './RowEditModal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { toast } from 'sonner'

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

  // CRUD state (ScalarDB tables only, non-system namespaces)
  const isWritable = source.kind === 'scalardb-table' && !['report_studio', 'scalardb', 'coordinator'].includes(source.namespace)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editModalRow, setEditModalRow] = useState<ScalarDbRowValues | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GridRow | null>(null)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Reload trigger
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Bulk PDF export from DB rows (#193). Only for sources whose rows are real data
  // maps (ScalarDB tables, product master) — form-responses rows carry only summaries.
  const supportsBulkPdf = source.kind === 'scalardb-table' || source.kind === 'product-master'
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [showBulkExport, setShowBulkExport] = useState(false)

  // Stable source key — prevents useEffect firing on object re-creation
  const sourceKey = toSourceKey(source)

  // Clear selection whenever the view changes (source / page / reload / search).
  useEffect(() => { setSelectedRows(new Set()) }, [sourceKey, currentPage, reloadKey, searchQuery])

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
  }, [sourceKey, currentPage, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Get key columns for ScalarDB tables
  const keyColumns = useMemo(() => {
    if (source.kind !== 'scalardb-table' || !scalarDbData) return new Set<string>()
    return new Set(scalarDbData.columns.filter((c) => c.keyType).map((c) => c.name))
  }, [source.kind, scalarDbData])

  // Inline edit commit
  async function handleInlineCommit(rowIndex: number, column: string, newValue: string) {
    if (source.kind !== 'scalardb-table') return
    const row = displayRows[rowIndex]
    if (!row) return
    const values: ScalarDbRowValues = {}
    // Include all key columns
    for (const k of keyColumns) values[k] = row[k] as string | number | boolean | null
    // Include the changed value
    const colMeta = scalarDbData?.columns.find((c) => c.name === column)
    if (colMeta) {
      switch (colMeta.type) {
        case 'INT': case 'BIGINT': values[column] = newValue === '' ? null : parseInt(newValue, 10); break
        case 'FLOAT': case 'DOUBLE': values[column] = newValue === '' ? null : parseFloat(newValue); break
        case 'BOOLEAN': values[column] = newValue === 'true'; break
        default: values[column] = newValue || null
      }
    }
    try {
      await updateScalarDbRow(source.namespace, source.table, values)
      reload()
    } catch (e) {
      toast.error('セルの更新に失敗しました', { description: e instanceof Error ? e.message : undefined })
    }
    setEditingCell(null)
  }

  // Delete handler
  async function handleDeleteConfirm() {
    if (source.kind !== 'scalardb-table' || !deleteTarget) return
    const keys: ScalarDbRowValues = {}
    for (const k of keyColumns) keys[k] = deleteTarget[k] as string | number | boolean | null
    try {
      await deleteScalarDbRow(source.namespace, source.table, keys)
      reload()
    } catch (e) {
      toast.error('行の削除に失敗しました', { description: e instanceof Error ? e.message : undefined })
    }
    setDeleteTarget(null)
  }

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
              onClick={reload}
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
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <DataGridToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearch}
            onExportCsv={handleExportCsv}
            totalRows={source.kind === 'product-master' ? sortedRows.length : totalRows}
            truncated={source.kind === 'scalardb-table' && (scalarDbData?.truncated ?? false)}
          />
        </div>
        {supportsBulkPdf && displayRows.length > 0 && (
          <button
            onClick={() => setShowBulkExport(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent mr-2 shrink-0"
            title="選択した行（未選択なら表示中の全行）を一括PDF出力"
          >
            <FileDown className="w-3.5 h-3.5" />
            一括PDF{selectedRows.size > 0 ? `（${selectedRows.size}）` : ''}
          </button>
        )}
        {isWritable && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent mr-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            行を追加
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {displayRows.length === 0 ? (
          <EmptyState
            title={searchQuery ? `「${searchQuery}」に一致するデータがありません` : 'データがありません'}
          />
        ) : (
          <table className="w-full text-xs min-w-max" aria-label="データグリッド">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {supportsBulkPdf && (
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="表示中をすべて選択"
                      checked={displayRows.length > 0 && selectedRows.size === displayRows.length}
                      ref={(el) => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < displayRows.length }}
                      onChange={(e) => setSelectedRows(e.target.checked ? new Set(displayRows.map((_, i) => i)) : new Set())}
                    />
                  </th>
                )}
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
                {isWritable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayRows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => {
                    if (!editingCell) {
                      if (isWritable) {
                        setEditModalRow(row as ScalarDbRowValues)
                      } else {
                        setDetailRow(row as Record<string, unknown>)
                      }
                    }
                  }}
                  className="hover:bg-muted/30 cursor-pointer group"
                >
                  {supportsBulkPdf && (
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`行 ${i + 1} を選択`}
                        checked={selectedRows.has(i)}
                        onChange={() => setSelectedRows((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i); else next.add(i)
                          return next
                        })}
                      />
                    </td>
                  )}
                  {columns.map((col) => {
                    const isEditing = editingCell?.rowIndex === i && editingCell?.column === col
                    const isKey = keyColumns.has(col)
                    return (
                      <td
                        key={col}
                        className={`px-3 py-1.5 whitespace-nowrap max-w-xs truncate ${isKey ? 'bg-muted/20' : ''}`}
                        onDoubleClick={(e) => {
                          if (!isWritable || isKey) return
                          e.stopPropagation()
                          setEditingCell({ rowIndex: i, column: col })
                          setEditValue(String(row[col] ?? ''))
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { void handleInlineCommit(i, col, editValue); e.preventDefault() }
                              if (e.key === 'Escape') setEditingCell(null)
                              e.stopPropagation()
                            }}
                            onBlur={() => { void handleInlineCommit(i, col, editValue) }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full border rounded px-1 py-0.5 text-xs bg-background outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          renderCell(row[col])
                        )}
                      </td>
                    )
                  })}
                  {isWritable && (
                    <td className="px-1 py-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}
                        className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="行を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
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

      {/* Detail panel (non-writable sources) */}
      {detailRow && !isWritable && (
        <DataDetailPanel
          row={detailRow}
          columns={columns}
          product={selectedProduct ?? undefined}
          onClose={() => setDetailRow(null)}
        />
      )}

      {/* Row edit modal (writable ScalarDB tables) */}
      {source.kind === 'scalardb-table' && isWritable && scalarDbData && (
        <>
          <RowEditModal
            open={showCreateModal}
            mode="create"
            namespace={source.namespace}
            table={source.table}
            columns={scalarDbData.columns}
            onSave={reload}
            onClose={() => setShowCreateModal(false)}
          />
          <RowEditModal
            open={editModalRow !== null}
            mode="edit"
            namespace={source.namespace}
            table={source.table}
            columns={scalarDbData.columns}
            row={editModalRow ?? undefined}
            onSave={reload}
            onClose={() => setEditModalRow(null)}
          />
        </>
      )}

      {/* Bulk PDF export from DB rows (#193) */}
      {supportsBulkPdf && (
        <BulkExportModal
          open={showBulkExport}
          rows={
            (selectedRows.size > 0
              ? displayRows.filter((_, i) => selectedRows.has(i))
              : displayRows) as Record<string, unknown>[]
          }
          onClose={() => setShowBulkExport(false)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="行を削除"
        message="この行を削除してもよろしいですか？この操作は元に戻せません。"
        confirmLabel="削除"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function renderCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
