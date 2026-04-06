import type { TableElement } from '@/types'
import { PropSection, PropRow, NumInput } from '@/elements/_base/sharedUI'

interface Props {
  el: TableElement
  onChange: (patch: Partial<TableElement>) => void
}

export function TablePropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="テーブル">
      <div className="grid grid-cols-2 gap-2">
        <PropRow label="行数"><NumInput value={el.rows} onChange={(v) => onChange({ rows: Math.max(1, v) })} min={1} /></PropRow>
        <PropRow label="列数"><NumInput value={el.columns} onChange={(v) => onChange({ columns: Math.max(1, v) })} min={1} /></PropRow>
      </div>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.headerRow} onChange={(e) => onChange({ headerRow: e.target.checked })} className="rounded" />
        ヘッダー行あり
      </label>
      <PropRow label="データバインド（フィールドキー）">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.dataBinding ?? ''} placeholder="例: items" onChange={(e) => onChange({ dataBinding: e.target.value || undefined })} />
      </PropRow>
    </PropSection>
  )
}
