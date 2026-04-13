import type { HankoElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: HankoElement
  onChange: (patch: Partial<HankoElement>) => void
}

export function HankoPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="印鑑">
      <PropRow label="テキスト">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.text} onChange={(e) => onChange({ text: e.target.value })} />
      </PropRow>
      <PropRow label="形状">
        <SelectInput value={el.shape} onChange={(v) => onChange({ shape: v as HankoElement['shape'] })} options={[{ value: 'circle', label: '丸印' }, { value: 'rectangle', label: '角印' }]} />
      </PropRow>
      <PropRow label="文字方向">
        <SelectInput value={el.writingMode} onChange={(v) => onChange({ writingMode: v as HankoElement['writingMode'] })} options={[{ value: 'vertical-rl', label: '縦書き' }, { value: 'horizontal-tb', label: '横書き' }]} />
      </PropRow>
      <PropRow label="枠線色"><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
      <PropRow label="文字色"><ColorInput value={el.textColor} onChange={(v) => onChange({ textColor: v })} /></PropRow>
      <PropRow label="フォントサイズ"><NumInput value={el.fontSize} onChange={(v) => onChange({ fontSize: v })} min={1} unit="mm" /></PropRow>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.doubleBorder} onChange={(e) => onChange({ doubleBorder: e.target.checked })} className="rounded" />
        二重枠
      </label>
      <PropRow label="データバインド">
        <FieldKeyInput value={el.binding ?? ''} onChange={(v) => onChange({ binding: v || undefined })} placeholder="例: approver.name" />
      </PropRow>
    </PropSection>
  )
}
