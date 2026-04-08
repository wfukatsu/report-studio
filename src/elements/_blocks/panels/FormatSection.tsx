import type { CalculationFormat, NumberFormatType, DateFormatType } from '@/types'
import { PropSection, PropRow, NumInput, SelectInput } from '@/elements/_base/sharedUI'

const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'integer', label: '整数' },
  { value: 'decimal', label: '小数' },
  { value: 'currency_jpy', label: '通貨 (円)' },
  { value: 'currency_usd', label: '通貨 ($)' },
  { value: 'percent', label: 'パーセント' },
  { value: 'comma', label: 'カンマ区切り' },
  { value: 'kanji_numeral', label: '漢数字' },
  { value: 'yyyy/MM/dd', label: 'yyyy/MM/dd' },
  { value: 'yyyy年MM月dd日', label: 'yyyy年MM月dd日' },
  { value: 'wareki_full', label: '和暦 (令和8年4月1日)' },
  { value: 'wareki_short', label: '和暦略 (R8.04.01)' },
  { value: 'custom', label: 'カスタム' },
]

interface FormatSectionProps {
  format?: CalculationFormat
  onChange: (format: CalculationFormat | undefined) => void
}

export function FormatSection({ format, onChange }: FormatSectionProps) {
  const handleTypeChange = (type: string) => {
    if (!type) {
      onChange(undefined)
      return
    }
    onChange({
      type: type as NumberFormatType | DateFormatType,
      decimalPlaces: type === 'decimal' ? (format?.decimalPlaces ?? 2) : undefined,
      customPattern: type === 'custom' ? (format?.customPattern ?? '') : undefined,
    })
  }

  return (
    <PropSection title="書式">
      <PropRow label="書式タイプ">
        <SelectInput
          value={format?.type ?? ''}
          onChange={handleTypeChange}
          options={[{ value: '', label: 'なし' }, ...FORMAT_OPTIONS]}
        />
      </PropRow>

      {format?.type === 'decimal' && (
        <PropRow label="小数桁数">
          <NumInput
            value={format.decimalPlaces ?? 2}
            onChange={(v) => onChange({ ...format, decimalPlaces: v })}
            min={0}
            max={10}
          />
        </PropRow>
      )}

      {format?.type === 'custom' && (
        <PropRow label="パターン">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={format.customPattern ?? ''}
            placeholder="例: #,##0.00"
            onChange={(e) => onChange({ ...format, customPattern: e.target.value })}
          />
        </PropRow>
      )}
    </PropSection>
  )
}
