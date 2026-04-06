import type { RevenueStampElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput } from '@/elements/_base/sharedUI'

interface Props {
  el: RevenueStampElement
  onChange: (patch: Partial<RevenueStampElement>) => void
}

export function RevenueStampPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="収入印紙欄">
      <PropRow label="金額テキスト">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.amount ?? ''} placeholder="例: 200円" onChange={(e) => onChange({ amount: e.target.value || undefined })} />
      </PropRow>
      <PropRow label="枠線色"><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
      <PropRow label="枠線幅"><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.showLabel} onChange={(e) => onChange({ showLabel: e.target.checked })} className="rounded" />
        「収入印紙」ラベル表示
      </label>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.showCancellationGuide} onChange={(e) => onChange({ showCancellationGuide: e.target.checked })} className="rounded" />
        消印ガイド表示
      </label>
    </PropSection>
  )
}
