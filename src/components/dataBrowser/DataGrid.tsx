import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Plus, Pencil, Trash2, FileDown } from 'lucide-react'
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
import { DataGridToolbar } from './DataGridToolbar'
import { exportToCsv } from './exportToCsv'
import { DataDetailPanel } from './DataDetailPanel'
import { RowEditModal } from './RowEditModal'
import { ProductMasterModal } from './ProductMasterModal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { toast } from 'sonner'

const PAGE_SIZE = 50

// Shared empty selection — returned while the view key doesn't match the
// stored selection (never mutated; all updates build fresh Sets).
const EMPTY_SELECTION: ReadonlySet<number> = new Set<number>()

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
  const { t } = useTranslation('components')
  const searchQuery = useDataBrowserStore((s) => s.searchQuery)
  const setSearch = useDataBrowserStore((s) => s.setSearch)
  const sortCol = useDataBrowserStore((s) => s.sortCol)
  const sortDir = useDataBrowserStore((s) => s.sortDir)
  const setSort = useDataBrowserStore((s) => s.setSort)
  const currentPage = useDataBrowserStore((s) => s.currentPage)
  const setPage = useDataBrowserStore((s) => s.setPage)
  const detailRow = useDataBrowserStore((s) => s.detailRow)
  const setDetailRow = useDataBrowserStore((s) => s.setDetailRow)

  // Load state is derived from a request-keyed result: anything not yet
  // resolved for the current view key is 'loading'. This removes the need to
  // set a loading flag synchronously inside the load effect.
  const [loadResult, setLoadResult] = useState<{ key: string; state: LoadState; error?: string } | null>(null)
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

  // Product master editing (#331): the dedicated ProductMasterTab editor
  // (add/edit/delete/CSV/custom-fields/duplicate-detection/optimistic-lock/
  // 90-day delete warning) is reachable directly from the DataBrowser, closing
  // the asymmetry with generic ScalarDB tables that already edit inline.
  const [showProductMaster, setShowProductMaster] = useState(false)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Reload trigger
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Bulk PDF export from DB rows (#193). Only for sources whose rows are real data
  // maps (ScalarDB tables, product master) — form-responses rows carry only summaries.
  const supportsBulkPdf = source.kind === 'scalardb-table' || source.kind === 'product-master'
  const [showBulkExport, setShowBulkExport] = useState(false)

  // Stable source key — prevents useEffect firing on object re-creation
  const sourceKey = toSourceKey(source)

  // Selection is keyed by the current view (source / page / reload / search):
  // when the view changes the key no longer matches and the selection reads as
  // empty — no clearing effect needed.
  const viewKey = `${sourceKey}|${currentPage}|${reloadKey}|${searchQuery}`
  const [selection, setSelection] = useState<{ key: string; rows: ReadonlySet<number> }>(
    () => ({ key: '', rows: EMPTY_SELECTION }),
  )
  const selectedRows: ReadonlySet<number> = selection.key === viewKey ? selection.rows : EMPTY_SELECTION
  const setSelectedRows = (next: Set<number> | ((prev: ReadonlySet<number>) => Set<number>)) => {
    setSelection((prev) => {
      const prevRows = prev.key === viewKey ? prev.rows : EMPTY_SELECTION
      return { key: viewKey, rows: typeof next === 'function' ? next(prevRows) : next }
    })
  }

  // Derived load status for the current request key
  const loadKey = `${sourceKey}|${currentPage}|${reloadKey}`
  const loadState: LoadState = loadResult?.key === loadKey ? loadResult.state : 'loading'
  const errorMsg = loadResult?.key === loadKey ? loadResult.error ?? '' : ''

  // Load data when source or page changes
  useEffect(() => {
    let cancelled = false

    if (source.kind === 'scalardb-table') {
      const offset = currentPage * PAGE_SIZE
      scanScalarDbTable(source.namespace, source.table, { offset, limit: PAGE_SIZE })
        .then((data) => {
          if (cancelled) return
          setScalarDbData(data)
          setColumns(data.columns.map((c) => c.name))
          setLoadResult({ key: loadKey, state: 'ok' })
        })
        .catch((e) => {
          if (cancelled) return
          setLoadResult({
            key: loadKey,
            state: 'error',
            error: e instanceof Error ? e.message : t('dataBrowser.dataGrid.loadFailed'),
          })
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
          setLoadResult({ key: loadKey, state: 'ok' })
        })
        .catch((e) => {
          if (cancelled) return
          setLoadResult({
            key: loadKey,
            state: 'error',
            error: e instanceof Error ? e.message : t('dataBrowser.dataGrid.productLoadFailed'),
          })
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
          setLoadResult({ key: loadKey, state: 'ok' })
        })
        .catch((e) => {
          if (cancelled) return
          setLoadResult({
            key: loadKey,
            state: 'error',
            error: e instanceof Error ? e.message : t('dataBrowser.dataGrid.responseLoadFailed'),
          })
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
      toast.error(t('dataBrowser.dataGrid.cellUpdateFailed'), { description: e instanceof Error ? e.message : undefined })
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
      toast.error(t('dataBrowser.dataGrid.rowDeleteFailed'), { description: e instanceof Error ? e.message : undefined })
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
        <EmptyState title={t('dataBrowser.dataGrid.loading')} />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="flex flex-col h-full">
        <DataGridToolbar searchQuery={searchQuery} onSearchChange={setSearch} onExportCsv={() => {}} totalRows={0} />
        <EmptyState
          title={t('dataBrowser.dataGrid.loadFailed')}
          description={errorMsg}
          action={
            <button
              onClick={reload}
              className="px-3 py-1.5 text-xs border rounded hover:bg-accent"
            >
              {t('dataBrowser.dataGrid.retry')}
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
            title={t('dataBrowser.dataGrid.bulkPdfTitle')}
          >
            <FileDown className="w-3.5 h-3.5" />
            {t('dataBrowser.dataGrid.bulkPdf')}{selectedRows.size > 0 ? t('dataBrowser.dataGrid.bulkPdfCount', { n: selectedRows.size }) : ''}
          </button>
        )}
        {isWritable && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent mr-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('dataBrowser.dataGrid.addRow')}
          </button>
        )}
        {source.kind === 'product-master' && (
          <button
            onClick={() => setShowProductMaster(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent mr-2 shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t('dataBrowser.dataGrid.editProductMaster')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {displayRows.length === 0 ? (
          <EmptyState
            title={searchQuery ? t('dataBrowser.dataGrid.noSearchMatch', { query: searchQuery }) : t('dataBrowser.dataGrid.noData')}
          />
        ) : (
          <table className="w-full text-xs min-w-max" aria-label={t('dataBrowser.dataGrid.gridLabel')}>
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {supportsBulkPdf && (
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={t('dataBrowser.dataGrid.selectAllVisible')}
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
                        aria-label={t('dataBrowser.dataGrid.selectRow', { n: i + 1 })}
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
                        title={t('dataBrowser.dataGrid.deleteRow')}
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
          {t('dataBrowser.dataGrid.pageInfo', { current: currentPage + 1, total: totalPages })}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label={t('dataBrowser.dataGrid.prevPage')}
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            aria-label={t('dataBrowser.dataGrid.nextPage')}
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
        title={t('dataBrowser.dataGrid.deleteRow')}
        message={t('dataBrowser.dataGrid.deleteConfirm')}
        confirmLabel={t('dataBrowser.dataGrid.delete')}
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Product master editor (#331) — reload the grid on close since edits
          may have changed the product rows. */}
      {showProductMaster && (
        <ProductMasterModal
          onClose={() => {
            setShowProductMaster(false)
            reload()
          }}
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
