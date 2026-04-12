import { useEffect, useState } from 'react'
import { useReportStore } from '@/store'
import type { Product, ProductCustomFieldDef } from '@/types'
import { cn } from '@/lib/utils'
import { ProductEditDialog } from './ProductEditDialog'
import { ProductCsvImportModal } from './ProductCsvImportModal'

type SortCol = 'code' | 'name' | 'category' | 'unitPrice'
type SortDir = 'asc' | 'desc'

const COLUMN_LABELS: Record<SortCol, string> = {
  code: '商品コード',
  name: '商品名',
  category: 'カテゴリ',
  unitPrice: '単価',
}

const TAX_LABELS: Record<string, string> = {
  none: '非課税',
  standard: '標準税率',
  reduced: '軽減税率',
}

export function ProductMasterTab() {
  const products = useReportStore((s) => s.products)
  const customFieldDefs = useReportStore((s) => s.customFieldDefs)
  const productsLoading = useReportStore((s) => s.productsLoading)
  const productsError = useReportStore((s) => s.productsError)
  const productOps = useReportStore((s) => s.productOps)
  const fetchProducts = useReportStore((s) => s.fetchProducts)
  const fetchCustomFieldDefs = useReportStore((s) => s.fetchCustomFieldDefs)
  const deleteProduct = useReportStore((s) => s.deleteProduct)
  const setProductOp = useReportStore((s) => s.setProductOp)

  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isFieldDefsOpen, setIsFieldDefsOpen] = useState(false)
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false)

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

  const sorted = [...filtered].sort((a, b) => {
    const av = sortCol === 'unitPrice' ? a[sortCol] : String(a[sortCol] ?? '')
    const bv = sortCol === 'unitPrice' ? b[sortCol] : String(b[sortCol] ?? '')
    const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv), 'ja')
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  async function handleDelete(product: Product) {
    if (productOps.get(product.id)) return
    if (!window.confirm(`商品「${product.name}」を削除しますか？\n削除後 90 日間は同じ商品コードは使用できません。`)) return
    setProductOp(product.id, 'deleting')
    try {
      await deleteProduct(product.id)
    } catch {
      alert('削除に失敗しました。再試行してください。')
    } finally {
      setProductOp(product.id, 'idle')
    }
  }

  if (productsLoading && products.length === 0) {
    return <div className="p-6 text-xs text-muted-foreground">商品マスターを読み込んでいます...</div>
  }

  return (
    <div className="p-4 flex flex-col gap-4" role="tabpanel" aria-label="商品マスター">
      {/* Custom field defs section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            カスタムフィールド定義
          </p>
          <button
            onClick={() => setIsFieldDefsOpen(true)}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            管理
          </button>
        </div>
        {customFieldDefs.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">カスタムフィールドはありません</p>
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
      </div>

      {/* Product list section */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            商品一覧 ({sorted.length}件)
          </p>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <input
              type="search"
              placeholder="商品コード・商品名で検索"
              aria-label="商品を検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded px-2 py-1 text-xs bg-background w-48"
            />
            <button
              onClick={() => setIsCsvImportOpen(true)}
              className="px-3 py-1 text-xs border rounded hover:bg-accent transition-colors"
            >
              CSV
            </button>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            >
              追加
            </button>
          </div>
        </div>

        {productsError && (
          <p className="text-xs text-red-500 mb-2">{productsError}</p>
        )}

        {sorted.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground border rounded">
            {search ? '検索結果がありません' : '商品がありません。「追加」から登録してください。'}
          </div>
        ) : (
          <div className="border rounded overflow-auto max-h-80">
            <table className="w-full text-xs" aria-label="商品一覧">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {(['code', 'name', 'category', 'unitPrice'] as SortCol[]).map((col) => (
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
                        'px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap',
                      )}
                    >
                      {COLUMN_LABELS[col]}
                      {sortCol === col && (
                        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">税区分</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((product) => {
                  const op = productOps.get(product.id)
                  const isBusy = !!op
                  return (
                    <tr key={product.id} className={cn('hover:bg-muted/30', isBusy && 'opacity-60')}>
                      <td className="px-3 py-1.5 font-mono">{product.code}</td>
                      <td className="px-3 py-1.5">{product.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{product.category || '—'}</td>
                      <td className="px-3 py-1.5 text-right">
                        {product.unitPrice.toLocaleString('ja-JP')}円
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {TAX_LABELS[product.taxType] ?? product.taxType}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingProduct(product)}
                            disabled={isBusy}
                            aria-label={`${product.name}を編集`}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors"
                          >
                            編集
                          </button>
                          <span className="text-muted-foreground">|</span>
                          <button
                            onClick={() => handleDelete(product)}
                            disabled={isBusy}
                            aria-label={`${product.name}を削除`}
                            className="text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                          >
                            {op === 'deleting' ? '削除中...' : '削除'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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

      {/* Custom field defs management dialog */}
      {isFieldDefsOpen && (
        <CustomFieldDefsDialog
          onClose={() => setIsFieldDefsOpen(false)}
        />
      )}

      {isCsvImportOpen && (
        <ProductCsvImportModal onClose={() => setIsCsvImportOpen(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom field definitions management dialog
// ---------------------------------------------------------------------------

function CustomFieldDefsDialog({ onClose }: { onClose: () => void }) {
  const customFieldDefs = useReportStore((s) => s.customFieldDefs)
  const updateCustomFieldDefs = useReportStore((s) => s.updateCustomFieldDefs)
  const [defs, setDefs] = useState<ProductCustomFieldDef[]>(() => [...customFieldDefs])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateCustomFieldDefs(defs)
      onClose()
    } catch {
      setError('保存に失敗しました。再試行してください。')
    } finally {
      setSaving(false)
    }
  }

  function addDef() {
    const newKey = `field${defs.length + 1}`
    setDefs([...defs, { key: newKey, label: '新しいフィールド', type: 'text' }])
  }

  function removeDef(index: number) {
    if (!window.confirm(`フィールド「${defs[index].label}」を削除しますか？\n既存商品のこのフィールドのデータは保持されますが表示されなくなります。`)) return
    setDefs(defs.filter((_, i) => i !== index))
  }

  function updateDef<K extends keyof ProductCustomFieldDef>(
    index: number,
    key: K,
    value: ProductCustomFieldDef[K],
  ) {
    setDefs(defs.map((d, i) => (i === index ? { ...d, [key]: value } : d)))
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="カスタムフィールド定義の管理"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-[480px] max-h-[80vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">カスタムフィールド定義</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent" aria-label="閉じる">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {defs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">カスタムフィールドはありません</p>
          )}
          {defs.map((def, i) => (
            <div key={i} className="flex items-center gap-2 border rounded p-2">
              <input
                value={def.key}
                onChange={(e) => updateDef(i, 'key', e.target.value)}
                placeholder="キー (英数字)"
                aria-label={`フィールド${i + 1}のキー`}
                className="border rounded px-2 py-1 text-xs bg-background w-28 font-mono"
              />
              <input
                value={def.label}
                onChange={(e) => updateDef(i, 'label', e.target.value)}
                placeholder="表示名"
                aria-label={`フィールド${i + 1}の表示名`}
                className="border rounded px-2 py-1 text-xs bg-background flex-1"
              />
              <select
                value={def.type}
                onChange={(e) => updateDef(i, 'type', e.target.value as ProductCustomFieldDef['type'])}
                aria-label={`フィールド${i + 1}の型`}
                className="border rounded px-2 py-1 text-xs bg-background"
              >
                <option value="text">テキスト</option>
                <option value="number">数値</option>
                <option value="date">日付</option>
                <option value="boolean">真偽値</option>
              </select>
              <button
                onClick={() => removeDef(i)}
                aria-label={`${def.label}を削除`}
                className="text-red-500 hover:text-red-700 text-xs"
              >
                削除
              </button>
            </div>
          ))}
          <button
            onClick={addDef}
            className="text-xs text-blue-600 hover:text-blue-800 border border-dashed rounded py-1.5 hover:bg-blue-50 transition-colors"
          >
            + フィールドを追加
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors">キャンセル</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
