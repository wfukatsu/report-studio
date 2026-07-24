import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import type { Product, ProductCustomFieldDef } from '@/types'
import { cn } from '@/lib/utils'
import { ProductEditDialog } from './ProductEditDialog'
import { ProductCsvImportModal } from './ProductCsvImportModal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'

type SortCol = 'code' | 'name' | 'category' | 'unitPrice' | 'stockCount' | 'taxType'
type SortDir = 'asc' | 'desc'

// Rendered/sortable data columns, in table order. Expanded from the original
// fixed 4 (code/name/category/unitPrice) to include stock and tax (#333).
const SORT_COLS: readonly SortCol[] = ['code', 'name', 'category', 'unitPrice', 'stockCount', 'taxType']
const NUMERIC_COLS: ReadonlySet<SortCol> = new Set(['unitPrice', 'stockCount'])
const PAGE_SIZE = 50

export function ProductMasterTab() {
  const { t } = useTranslation('modals')
  const TAX_LABELS: Record<string, string> = {
    none: t('productMasterTab.tax.none'),
    standard: t('productMasterTab.tax.standard'),
    reduced: t('productMasterTab.tax.reduced'),
  }
  const COLUMN_LABELS: Record<SortCol, string> = {
    code: t('productMasterTab.columns.code'),
    name: t('productMasterTab.columns.name'),
    category: t('productMasterTab.columns.category'),
    unitPrice: t('productMasterTab.columns.unitPrice'),
    stockCount: t('productMasterTab.columns.stockCount'),
    taxType: t('productMasterTab.taxColumn'),
  }
  const products = useReportStore((s) => s.products)
  const customFieldDefs = useReportStore((s) => s.customFieldDefs)
  const productsLoading = useReportStore((s) => s.productsLoading)
  const productsError = useReportStore((s) => s.productsError)
  const productOps = useReportStore((s) => s.productOps)
  const fetchProducts = useReportStore((s) => s.fetchProducts)
  const fetchCustomFieldDefs = useReportStore((s) => s.fetchCustomFieldDefs)
  const customFieldDefsError = useReportStore((s) => s.customFieldDefsError)
  const deleteProduct = useReportStore((s) => s.deleteProduct)
  const setProductOp = useReportStore((s) => s.setProductOp)

  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(0)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isFieldDefsOpen, setIsFieldDefsOpen] = useState(false)
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  useEffect(() => {
    // Always fetch on mount to ensure latest data is shown
    fetchProducts()
    fetchCustomFieldDefs()
  }, [fetchProducts, fetchCustomFieldDefs])

  const filtered = products.filter(
    (p) =>
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase()),
  )

  function sortValue(p: Product, col: SortCol): string | number {
    if (col === 'unitPrice') return p.unitPrice
    if (col === 'stockCount') return p.stockCount
    if (col === 'taxType') return TAX_LABELS[p.taxType] ?? p.taxType
    return String(p[col] ?? '')
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortCol)
    const bv = sortValue(b, sortCol)
    const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv), 'ja')
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Paginate the rendered rows (#333) so a large catalog never mounts thousands
  // of DOM rows at once. `page` is clamped in case the filtered set shrank.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(0)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(0)
  }

  async function execDelete(product: Product) {
    setProductOp(product.id, 'deleting')
    try {
      await deleteProduct(product.id)
    } catch {
      toast.error(t('productMasterTab.deleteFailed'), { duration: 8000 })
    } finally {
      setProductOp(product.id, 'idle')
    }
  }

  function handleDelete(product: Product) {
    if (productOps.get(product.id)) return
    setDeleteTarget(product)
  }

  if (productsLoading && products.length === 0) {
    return <div className="p-6 text-xs text-muted-foreground">{t('productMasterTab.loading')}</div>
  }

  return (
    <div className="p-4 flex flex-col gap-4" role="tabpanel" aria-label={t('productMasterTab.tabLabel')}>
      {/* Custom field defs section (#395: management expands inline, not a modal) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('productMasterTab.customFieldsHeading')}
          </p>
          <button
            onClick={() => setIsFieldDefsOpen((v) => !v)}
            aria-expanded={isFieldDefsOpen}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            {isFieldDefsOpen ? t('productMasterTab.close') : t('productMasterTab.manage')}
          </button>
        </div>
        {customFieldDefs.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">{t('productMasterTab.noCustomFields')}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {customFieldDefs.map((def) => (
              <span
                key={def.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-muted rounded border"
              >
                {def.label}
                <span className="text-muted-foreground">({def.type})</span>
              </span>
            ))}
          </div>
        )}
        {isFieldDefsOpen && (
          <div className="mt-2">
            <CustomFieldDefsPanel onClose={() => setIsFieldDefsOpen(false)} />
          </div>
        )}
      </div>

      {/* Product list section */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('productMasterTab.productListCount', { n: sorted.length })}
          </p>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <input
              type="search"
              placeholder={t('productMasterTab.searchPlaceholder')}
              aria-label={t('productMasterTab.searchLabel')}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="border rounded px-2 py-1 text-xs bg-background w-48"
            />
            <button
              onClick={() => setIsCsvImportOpen((v) => !v)}
              aria-expanded={isCsvImportOpen}
              className={cn(
                'px-3 py-1 text-xs border rounded hover:bg-accent transition-colors',
                isCsvImportOpen && 'bg-accent',
              )}
            >
              CSV
            </button>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            >
              {t('productMasterTab.add')}
            </button>
          </div>
        </div>

        {/* CSV import (#395: expands inline, not a stacked modal) */}
        {isCsvImportOpen && (
          <div className="mb-3">
            <ProductCsvImportModal onClose={() => setIsCsvImportOpen(false)} />
          </div>
        )}

        {productsError && (
          <p className="text-xs text-red-500 mb-2">{productsError}</p>
        )}

        {/* #433: custom columns silently vanished when the defs fetch failed */}
        {customFieldDefsError != null && (
          <InlineErrorBanner
            className="mb-2"
            error={customFieldDefsError}
            onRetry={() => { void fetchCustomFieldDefs() }}
          />
        )}

        {sorted.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground border rounded">
            {search ? t('productMasterTab.noSearchResults') : t('productMasterTab.noProducts')}
          </div>
        ) : (
          <>
          <div className="border rounded overflow-auto max-h-80">
            <table className="w-full text-xs" aria-label={t('productMasterTab.productListLabel')}>
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {SORT_COLS.map((col) => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      aria-sort={
                        sortCol === col
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className={cn(
                        'px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap',
                        NUMERIC_COLS.has(col) ? 'text-right' : 'text-left',
                      )}
                    >
                      {COLUMN_LABELS[col]}
                      {sortCol === col && (
                        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('productMasterTab.actionsColumn')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((product) => {
                  const op = productOps.get(product.id)
                  const isBusy = !!op
                  return (
                    <tr key={product.id} className={cn('hover:bg-muted/30', isBusy && 'opacity-60')}>
                      <td className="px-3 py-1.5 font-mono">{product.code}</td>
                      <td className="px-3 py-1.5">{product.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{product.category || '—'}</td>
                      <td className="px-3 py-1.5 text-right">
                        {t('productMasterTab.priceYen', { price: product.unitPrice.toLocaleString('ja-JP') })}
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {product.stockCount.toLocaleString('ja-JP')}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {TAX_LABELS[product.taxType] ?? product.taxType}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingProduct(product)}
                            disabled={isBusy}
                            aria-label={t('productMasterTab.editAria', { name: product.name })}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors"
                          >
                            {t('productMasterTab.edit')}
                          </button>
                          <span className="text-muted-foreground">|</span>
                          <button
                            onClick={() => handleDelete(product)}
                            disabled={isBusy}
                            aria-label={t('productMasterTab.deleteAria', { name: product.name })}
                            className="text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                          >
                            {op === 'deleting' ? t('productMasterTab.deleting') : t('productMasterTab.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{t('productMasterTab.pageInfo', { current: safePage + 1, total: totalPages })}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(() => Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  aria-label={t('productMasterTab.prevPage')}
                  className="px-2 py-1 border rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                <button
                  onClick={() => setPage(() => Math.min(totalPages - 1, safePage + 1))}
                  disabled={safePage >= totalPages - 1}
                  aria-label={t('productMasterTab.nextPage')}
                  className="px-2 py-1 border rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Add/Edit dialog */}
      {(isAddOpen || editingProduct) && (
        <ProductEditDialog
          product={editingProduct}
          onClose={() => {
            setEditingProduct(null)
            setIsAddOpen(false)
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('productMasterTab.deleteConfirmTitle')}
        message={t('productMasterTab.deleteConfirmMessage', { name: deleteTarget?.name })}
        confirmLabel={t('productMasterTab.delete')}
        confirmVariant="danger"
        onConfirm={() => { if (deleteTarget) void execDelete(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom field definitions management dialog
// ---------------------------------------------------------------------------

function CustomFieldDefsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('modals')
  const customFieldDefs = useReportStore((s) => s.customFieldDefs)
  const updateCustomFieldDefs = useReportStore((s) => s.updateCustomFieldDefs)
  const [defs, setDefs] = useState<ProductCustomFieldDef[]>(() => [...customFieldDefs])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeDefTarget, setRemoveDefTarget] = useState<{ index: number; label: string } | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateCustomFieldDefs(defs)
      onClose()
    } catch {
      setError(t('productMasterTab.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function addDef() {
    const newKey = `field${defs.length + 1}`
    setDefs([...defs, { key: newKey, label: t('productMasterTab.newFieldLabel'), type: 'text' }])
  }

  function removeDef(index: number) {
    setRemoveDefTarget({ index, label: defs[index].label })
  }

  function updateDef<K extends keyof ProductCustomFieldDef>(
    index: number,
    key: K,
    value: ProductCustomFieldDef[K],
  ) {
    setDefs(defs.map((d, i) => (i === index ? { ...d, [key]: value } : d)))
  }

  return (
    // #395: renders inline within ProductMasterTab (was a stacked full-screen
    // modal on top of the product-master modal).
    <div
      className="border border-border rounded-lg bg-muted/20 flex flex-col max-h-[70vh]"
      role="region"
      aria-label={t('productMasterTab.customFieldsDialogLabel')}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">{t('productMasterTab.customFieldsHeading')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent" aria-label={t('productMasterTab.close')}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {defs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">{t('productMasterTab.noCustomFields')}</p>
          )}
          {defs.map((def, i) => (
            <div key={i} className="flex items-center gap-2 border rounded p-2">
              <input
                value={def.key}
                onChange={(e) => updateDef(i, 'key', e.target.value)}
                placeholder={t('productMasterTab.keyPlaceholder')}
                aria-label={t('productMasterTab.fieldKeyAria', { index: i + 1 })}
                className="border rounded px-2 py-1 text-xs bg-background w-28 font-mono"
              />
              <input
                value={def.label}
                onChange={(e) => updateDef(i, 'label', e.target.value)}
                placeholder={t('productMasterTab.labelPlaceholder')}
                aria-label={t('productMasterTab.fieldLabelAria', { index: i + 1 })}
                className="border rounded px-2 py-1 text-xs bg-background flex-1"
              />
              <select
                value={def.type}
                onChange={(e) => updateDef(i, 'type', e.target.value as ProductCustomFieldDef['type'])}
                aria-label={t('productMasterTab.fieldTypeAria', { index: i + 1 })}
                className="border rounded px-2 py-1 text-xs bg-background"
              >
                <option value="text">{t('productMasterTab.typeText')}</option>
                <option value="number">{t('productMasterTab.typeNumber')}</option>
                <option value="date">{t('productMasterTab.typeDate')}</option>
                <option value="boolean">{t('productMasterTab.typeBoolean')}</option>
              </select>
              <button
                onClick={() => removeDef(i)}
                aria-label={t('productMasterTab.fieldDeleteAria', { label: def.label })}
                className="text-red-500 hover:text-red-700 text-xs"
              >
                {t('productMasterTab.delete')}
              </button>
            </div>
          ))}
          <button
            onClick={addDef}
            className="text-xs text-blue-600 hover:text-blue-800 border border-dashed rounded py-1.5 hover:bg-blue-50 transition-colors"
          >
            {t('productMasterTab.addField')}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors">{t('productMasterTab.cancel')}</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {saving ? t('productMasterTab.saving') : t('productMasterTab.save')}
          </button>
        </div>

      <ConfirmDialog
        open={removeDefTarget !== null}
        title={t('productMasterTab.fieldDeleteConfirmTitle')}
        message={t('productMasterTab.fieldDeleteConfirmMessage', { label: removeDefTarget?.label })}
        confirmLabel={t('productMasterTab.delete')}
        confirmVariant="danger"
        onConfirm={() => {
          if (removeDefTarget) setDefs(defs.filter((_, i) => i !== removeDefTarget.index))
          setRemoveDefTarget(null)
        }}
        onCancel={() => setRemoveDefTarget(null)}
      />
    </div>
  )
}
