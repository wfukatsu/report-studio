import type { ManualEntryField } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ManualEntryField
  onChange: (patch: Partial<ManualEntryField>) => void
}

export function ManualEntryPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="記入欄">
      <PropRow label="ラベル">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.label} onChange={(e) => onChange({ label: e.target.value })} />
      </PropRow>
      <PropRow label="ラベル位置">
        <SelectInput value={el.labelPosition} onChange={(v) => onChange({ labelPosition: v as ManualEntryField['labelPosition'] })} options={[{ value: 'top', label: '上' }, { value: 'left', label: '左' }, { value: 'none', label: 'なし' }]} />
      </PropRow>
      <PropRow label="表示形式">
        <SelectInput value={el.displayMode} onChange={(v) => onChange({ displayMode: v as ManualEntryField['displayMode'] })} options={[{ value: 'line', label: '下線' }, { value: 'box', label: 'ボックス' }, { value: 'grid', label: 'マス目' }, { value: 'none', label: 'なし' }]} />
      </PropRow>
      {el.displayMode === 'grid' && (
        <PropRow label="マス数"><NumInput value={el.gridCount ?? 10} onChange={(v) => onChange({ gridCount: v })} min={1} max={50} /></PropRow>
      )}
      <PropRow label="線の色"><ColorInput value={el.lineColor} onChange={(v) => onChange({ lineColor: v })} /></PropRow>
      <PropRow label="プレースホルダー">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
      </PropRow>
    </PropSection>
  )
}
