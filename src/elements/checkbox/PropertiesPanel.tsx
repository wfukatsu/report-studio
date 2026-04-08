import type { CheckboxElement, CheckmarkStyle, CheckboxLabelPosition } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: CheckboxElement
  onChange: (patch: Partial<CheckboxElement>) => void
}

export function CheckboxPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="チェックボックス">
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={el.checked}
          onChange={(e) => onChange({ checked: e.target.checked })}
          className="rounded"
        />
        チェック済み（プレビュー用）
      </label>
      <PropRow label="チェックマーク記号">
        <SelectInput
          value={el.checkmark}
          onChange={(v) => onChange({ checkmark: v as CheckmarkStyle })}
          options={[
            { value: '✓', label: '✓ チェック' },
            { value: '×', label: '× バツ' },
            { value: '●', label: '● 黒丸' },
          ]}
        />
      </PropRow>
      <PropRow label="ラベル">
        <input
          type="text"
          className="border rounded px-2 py-1 text-xs w-full bg-background"
          value={el.label}
          placeholder="ラベルテキスト"
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </PropRow>
      <PropRow label="ラベル位置">
        <SelectInput
          value={el.labelPosition ?? 'right'}
          onChange={(v) => onChange({ labelPosition: v as CheckboxLabelPosition })}
          options={[
            { value: 'right', label: '右' },
            { value: 'left', label: '左' },
            { value: 'top', label: '上' },
            { value: 'bottom', label: '下' },
          ]}
        />
      </PropRow>
      <PropRow label="データバインド">
        <input
          type="text"
          className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
          value={el.dataSource ?? ''}
          placeholder="例: employee.checked"
          onChange={(e) => onChange({ dataSource: e.target.value || undefined })}
        />
      </PropRow>
    </PropSection>
  )
}
