/**
 * ExportVariantDialog — select an OutputVariant before PDF export.
 * Selecting "なし（すべて表示）" exports without any variant applied.
 */

import { X } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { useShallow } from 'zustand/shallow'
import type { OutputVariant } from '@/types'

interface Props {
  open: boolean
  onSelect: (variant: OutputVariant | null) => void
  onCancel: () => void
}

export function ExportVariantDialog({ open, onSelect, onCancel }: Props) {
  const variants = useReportStore(
    useShallow((s) => s.definition.outputVariants as OutputVariant[]),
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="PDF出力バリアント選択"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-background rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">PDF出力バリアント</h2>
          <button
            onClick={onCancel}
            className="rounded hover:bg-accent p-1"
            aria-label="キャンセル"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-3 space-y-1">
          <button
            className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent"
            onClick={() => onSelect(null)}
          >
            なし（すべて表示）
          </button>

          {variants.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-2">
              バリアントがありません。
            </p>
          )}

          {variants.map((v) => (
            <button
              key={v.id}
              className="w-full text-left px-3 py-2 rounded hover:bg-accent"
              onClick={() => onSelect(v)}
            >
              <div className="text-sm font-medium">{v.name}</div>
              {v.targetAudience && (
                <div className="text-xs text-muted-foreground">{v.targetAudience}</div>
              )}
              <div className="text-[10px] text-muted-foreground mt-0.5">
                非表示 {v.hiddenElementIds.length} / マスク {v.maskingRules.length}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
