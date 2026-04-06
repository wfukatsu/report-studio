import type { DataFieldElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: DataFieldElement
  onChange: (patch: Partial<DataFieldElement>) => void
}

export function DataFieldPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="データバインド">
      <PropRow label="フィールドキー">
        <FieldKeyInput
          value={el.fieldKey}
          onChange={(v) => onChange({ fieldKey: v })}
          placeholder="例: customer_name"
        />
      </PropRow>
      <PropRow label="ラベル">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.label ?? ''} placeholder="未入力時のラベル" onChange={(e) => onChange({ label: e.target.value })} />
      </PropRow>
      <PropRow label="フォールバックテキスト">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.fallbackText ?? ''} placeholder="データなし時に表示するテキスト" onChange={(e) => onChange({ fallbackText: e.target.value })} />
      </PropRow>
      <PropRow label="書式タイプ">
        <SelectInput
          value={el.format?.type ?? ''}
          onChange={(v) => onChange({ format: v ? { ...(el.format ?? {}), type: v as NonNullable<typeof el.format>['type'] } : undefined })}
          options={[
            { value: '', label: '（なし）' },
            { value: 'integer', label: '整数' },
            { value: 'decimal', label: '小数' },
            { value: 'currency_jpy', label: '円（¥）' },
            { value: 'currency_usd', label: 'USD ($)' },
            { value: 'percent', label: 'パーセント' },
            { value: 'comma', label: 'カンマ区切り' },
            { value: 'kanji_numeral', label: '漢数字 (大字)' },
            { value: 'yyyy/MM/dd', label: 'yyyy/MM/dd' },
            { value: 'yyyy年MM月dd日', label: 'yyyy年MM月dd日' },
            { value: 'wareki_full', label: '和暦（令和〇年〇月〇日）' },
            { value: 'wareki_short', label: '和暦短縮 (R6.04.01)' },
            { value: 'custom', label: 'カスタム' },
          ]}
        />
      </PropRow>
    </PropSection>
  )
}
