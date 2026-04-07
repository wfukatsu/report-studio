import type { ManualEntryField } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ManualEntryField
  onChange: (patch: Partial<ManualEntryField>) => void
}

export function ManualEntryPropertiesPanel({ el, onChange }: Props) {
  return (
    <>
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
      <PropSection title="フリガナ設定">
        <PropRow label="">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              aria-label="フリガナ欄を表示"
              checked={el.furiganaEnabled ?? false}
              onChange={(e) => onChange({ furiganaEnabled: e.target.checked })}
            />
            フリガナ欄を表示
          </label>
        </PropRow>
        {el.furiganaEnabled && (
          <>
            <PropRow label="高さ割合">
              <NumInput value={el.furiganaRatio ?? 0.35} onChange={(v) => onChange({ furiganaRatio: v })} min={0.1} max={0.9} step={0.05} />
            </PropRow>
            <PropRow label="データソース">
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs w-full bg-background"
                placeholder="例: employee.furigana"
                value={el.furiganaDataSource ?? ''}
                onChange={(e) => onChange({ furiganaDataSource: e.target.value || undefined })}
              />
            </PropRow>
          </>
        )}
      </PropSection>
    </>
  )
}
