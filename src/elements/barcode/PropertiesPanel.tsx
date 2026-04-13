import type { BarcodeElement } from '@/types'
import { PropSection, PropRow, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: BarcodeElement
  onChange: (patch: Partial<BarcodeElement>) => void
}

export function BarcodePropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="バーコード">
      <PropRow label="種別">
        <SelectInput value={el.kind} onChange={(v) => onChange({ kind: v as BarcodeElement['kind'] })} options={[{ value: 'qr', label: 'QRコード' }, { value: 'code128', label: 'CODE128' }, { value: 'code39', label: 'CODE39' }, { value: 'jan13', label: 'JAN13 (EAN-13)' }]} />
      </PropRow>
      <PropRow label="値 / フィールドキー">
        <FieldKeyInput value={el.value} onChange={(v) => onChange({ value: v })} placeholder="値または {{fieldKey}}" />
      </PropRow>
      {el.kind === 'qr' && (
        <PropRow label="誤り訂正レベル">
          <SelectInput value={el.errorCorrection ?? 'M'} onChange={(v) => onChange({ errorCorrection: v as BarcodeElement['errorCorrection'] })} options={[{ value: 'L', label: 'L（低）' }, { value: 'M', label: 'M（中）' }, { value: 'Q', label: 'Q（高）' }, { value: 'H', label: 'H（最高）' }]} />
        </PropRow>
      )}
      <PropRow label="バーコード色"><ColorInput value={el.darkColor ?? '#000000'} onChange={(v) => onChange({ darkColor: v })} /></PropRow>
      <PropRow label="背景色"><ColorInput value={el.lightColor ?? '#ffffff'} onChange={(v) => onChange({ lightColor: v })} /></PropRow>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.showText ?? true} onChange={(e) => onChange({ showText: e.target.checked })} className="rounded" />
        テキスト表示
      </label>
    </PropSection>
  )
}
