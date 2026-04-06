import type { ShapeElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ShapeElement
  onChange: (patch: Partial<ShapeElement>) => void
}

export function ShapePropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="図形">
      <PropRow label="形状">
        <SelectInput value={el.shape} onChange={(v) => onChange({ shape: v as ShapeElement['shape'] })} options={[{ value: 'rectangle', label: '矩形' }, { value: 'circle', label: '円' }, { value: 'line', label: '線' }]} />
      </PropRow>
      <PropRow label="塗りつぶし色"><ColorInput value={el.fill ?? '#ffffff'} onChange={(v) => onChange({ fill: v })} /></PropRow>
      <PropRow label="枠線色"><ColorInput value={el.stroke ?? '#000000'} onChange={(v) => onChange({ stroke: v })} /></PropRow>
      <PropRow label="枠線幅"><NumInput value={el.strokeWidth ?? 0.3} onChange={(v) => onChange({ strokeWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      <PropRow label="枠線スタイル">
        <SelectInput value={el.strokeDash ?? 'solid'} onChange={(v) => onChange({ strokeDash: v as ShapeElement['strokeDash'] })} options={[{ value: 'solid', label: '実線' }, { value: 'dashed', label: '破線' }, { value: 'dotted', label: '点線' }]} />
      </PropRow>
      {el.shape === 'rectangle' && (
        <PropRow label="角丸"><NumInput value={el.borderRadius ?? 0} onChange={(v) => onChange({ borderRadius: v })} min={0} step={0.5} unit="mm" /></PropRow>
      )}
    </PropSection>
  )
}
