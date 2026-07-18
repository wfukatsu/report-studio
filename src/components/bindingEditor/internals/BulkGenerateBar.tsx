/**
 * BulkGenerateBar — Floating bar for bulk-generating items.
 *
 * Shows a list of items to be created and confirm/cancel buttons.
 */

import { memo } from 'react'
import { Wand2, X } from 'lucide-react'
import type { BulkItem } from '../types'

interface BulkGenerateBarProps {
  /** Describes the action, e.g. "未配置フィールドから要素を生成". */
  readonly title: string
  readonly items: readonly BulkItem[]
  readonly onGenerate: () => void
  readonly onCancel: () => void
}

export const BulkGenerateBar = memo(function BulkGenerateBar({
  title,
  items,
  onGenerate,
  onCancel,
}: BulkGenerateBarProps) {
  const empty = items.length === 0

  return (
    <div className="mx-2 mb-2 border rounded-lg bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b">
        <Wand2 className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-medium text-primary flex-1">
          {title}
        </span>
        {!empty && (
          <span className="text-[9px] bg-primary/20 text-primary rounded-full px-1.5">
            {items.length}
          </span>
        )}
      </div>

      {/* Item list / empty state */}
      {empty ? (
        <div className="px-3 py-2 text-[10px] text-muted-foreground">
          生成できる項目はありません（すべて配置済みです）。
        </div>
      ) : (
        <div className="max-h-32 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 px-3 py-1 text-[10px] border-b last:border-b-0"
            >
              <span className="text-muted-foreground text-[9px] shrink-0">{item.type}</span>
              <span className="truncate">{item.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/10">
        {!empty && (
          <button
            className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            onClick={onGenerate}
          >
            <Wand2 className="w-3 h-3" /> 生成する
          </button>
        )}
        <button
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
          onClick={onCancel}
        >
          <X className="w-3 h-3" /> {empty ? '閉じる' : 'キャンセル'}
        </button>
      </div>
    </div>
  )
})
