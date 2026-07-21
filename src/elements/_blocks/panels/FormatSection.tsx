import { useTranslation } from 'react-i18next'
import type { CalculationFormat, NumberFormatType, DateFormatType, AddressFormatType } from '@/types'
import { PropSection, PropRow, NumInput, SelectInput } from '@/elements/_base/sharedUI'

// `as const satisfies` keeps `labelKey` literal so `t(o.labelKey)` type-checks
// against the typed i18next catalog (#329). `value` stays the format-type enum.
const FORMAT_OPTIONS = [
  { value: 'integer', labelKey: 'blocks.format.integer' },
  { value: 'decimal', labelKey: 'blocks.format.decimal' },
  { value: 'currency_jpy', labelKey: 'blocks.format.currencyJpy' },
  { value: 'currency_usd', labelKey: 'blocks.format.currencyUsd' },
  { value: 'percent', labelKey: 'blocks.format.percent' },
  { value: 'comma', labelKey: 'blocks.format.comma' },
  { value: 'kanji_numeral', labelKey: 'blocks.format.kanjiNumeral' },
  { value: 'yyyy/MM/dd', labelKey: 'blocks.format.dateYmdSlash' },
  { value: 'yyyy年MM月dd日', labelKey: 'blocks.format.dateYmdKanji' },
  { value: 'wareki_full', labelKey: 'blocks.format.warekiFull' },
  { value: 'wareki_short', labelKey: 'blocks.format.warekiShort' },
  { value: 'custom', labelKey: 'blocks.format.custom' },
  { value: 'address_single', labelKey: 'blocks.format.addressSingle' },
  { value: 'address_multiline', labelKey: 'blocks.format.addressMultiline' },
] as const satisfies readonly { value: string; labelKey: string }[]

interface FormatSectionProps {
  format?: CalculationFormat
  onChange: (format: CalculationFormat | undefined) => void
}

export function FormatSection({ format, onChange }: FormatSectionProps) {
  const { t } = useTranslation('elements')
  const handleTypeChange = (type: string) => {
    if (!type) {
      onChange(undefined)
      return
    }
    onChange({
      type: type as NumberFormatType | DateFormatType | AddressFormatType,
      decimalPlaces: type === 'decimal' ? (format?.decimalPlaces ?? 2) : undefined,
      customPattern: type === 'custom' ? (format?.customPattern ?? '') : undefined,
    })
  }

  return (
    <PropSection title={t('blocks.format.title')}>
      <PropRow label={t('blocks.format.formatType')}>
        <SelectInput
          value={format?.type ?? ''}
          onChange={handleTypeChange}
          options={[
            { value: '', label: t('blocks.format.none') },
            ...FORMAT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
          ]}
        />
      </PropRow>

      {format?.type === 'decimal' && (
        <PropRow label={t('blocks.format.decimalPlaces')}>
          <NumInput
            value={format.decimalPlaces ?? 2}
            onChange={(v) => onChange({ ...format, decimalPlaces: v })}
            min={0}
            max={10}
          />
        </PropRow>
      )}

      {format?.type === 'custom' && (
        <PropRow label={t('blocks.format.pattern')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={format.customPattern ?? ''}
            placeholder={t('blocks.format.patternPlaceholder')}
            onChange={(e) => onChange({ ...format, customPattern: e.target.value })}
          />
        </PropRow>
      )}
    </PropSection>
  )
}
