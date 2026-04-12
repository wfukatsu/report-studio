import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { Product } from '@/types'

interface Props {
  row: Record<string, unknown>
  columns: string[]
  isProductMaster?: boolean
  onClose: () => void
}

export function DataDetailPanel({ row, columns, isProductMaster, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const priceHistory = isProductMaster
    ? (row as unknown as Product).priceHistory ?? []
    : []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="行の詳細"
      className="fixed right-0 top-0 h-full w-[360px] bg-background border-l shadow-xl flex flex-col z-40 animate-in slide-in-from-right-8 duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold">行の詳細</h2>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody className="divide-y">
            {columns.map((col) => (
              <tr key={col} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium text-muted-foreground w-32 shrink-0 align-top">
                  {col}
                </td>
                <td className="px-3 py-2 break-all">
                  {renderValue(row[col])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Price history (product master only) */}
        {isProductMaster && priceHistory.length > 0 && (
          <details className="border-t">
            <summary className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted/30 text-muted-foreground">
              単価変更履歴（{priceHistory.length}件）
            </summary>
            <table className="w-full text-xs" aria-label="単価変更履歴">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">適用日</th>
                  <th className="px-3 py-1.5 text-right font-medium">単価</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {priceHistory.map((h, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1">{h.effectiveFrom}</td>
                    <td className="px-3 py-1 text-right">{h.price.toLocaleString('ja-JP')}円</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  )
}

function renderValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
