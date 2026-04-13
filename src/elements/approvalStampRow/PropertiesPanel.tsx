import type { ApprovalStampRowElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: ApprovalStampRowElement
  onChange: (patch: Partial<ApprovalStampRowElement>) => void
}

export function ApprovalStampRowPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="多段印鑑欄">
      <PropRow label="ラベル位置">
        <SelectInput value={el.labelPosition} onChange={(v) => onChange({ labelPosition: v as ApprovalStampRowElement['labelPosition'] })} options={[{ value: 'top', label: '上' }, { value: 'bottom', label: '下' }]} />
      </PropRow>
      <PropRow label="枠線色"><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
      <PropRow label="枠線幅"><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      <div>
        <span className="text-[10px] text-muted-foreground">セル（役職名）</span>
        <div className="mt-1 space-y-2">
          {el.cells.map((cell, i) => (
            <div key={i} className="border rounded p-1.5 space-y-1">
              <div className="flex gap-1 items-center">
                <input type="text" className="border rounded px-1.5 py-0.5 text-xs flex-1 bg-background" placeholder="役職名" value={cell.role} onChange={(e) => { const cells = el.cells.map((c, ci) => ci === i ? { ...c, role: e.target.value } : c); onChange({ cells }) }} />
                <NumInput value={cell.width} onChange={(v) => { const cells = el.cells.map((c, ci) => ci === i ? { ...c, width: v } : c); onChange({ cells }) }} min={5} unit="mm" />
                <button className="text-xs text-destructive px-1" onClick={() => onChange({ cells: el.cells.filter((_, ci) => ci !== i) })}>×</button>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">印影画像 URL / バインディング</span>
                <FieldKeyInput
                  value={cell.stampSrc ?? ''}
                  onChange={(v) => { const cells = el.cells.map((c, ci) => ci === i ? { ...c, stampSrc: v || undefined } : c); onChange({ cells }) }}
                  placeholder="例: approver.stampUrl"
                />
              </div>
            </div>
          ))}
          <button className="text-xs text-primary hover:underline" onClick={() => onChange({ cells: [...el.cells, { role: '担当', width: 15 }] })}>＋ セル追加</button>
        </div>
      </div>
    </PropSection>
  )
}
