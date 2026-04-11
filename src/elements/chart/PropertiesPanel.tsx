import type { ChartElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'
import { DataBindingSection } from '@/elements/_blocks/panels/DataBindingSection'

interface Props {
  el: ChartElement
  onChange: (patch: Partial<ChartElement>) => void
}

export function ChartPropertiesPanel({ el, onChange }: Props) {
  const isPieType = el.chartType === 'pie' || el.chartType === 'donut'

  return (
    <>
      <PropSection title="グラフ">
        <PropRow label="グラフ種別">
          <SelectInput
            value={el.chartType}
            onChange={(v) => onChange({ chartType: v as ChartElement['chartType'] })}
            options={[
              { value: 'bar', label: '棒グラフ' },
              { value: 'line', label: '折れ線グラフ' },
              { value: 'pie', label: '円グラフ' },
              { value: 'donut', label: 'ドーナツグラフ' },
            ]}
          />
        </PropRow>
        <PropRow label="タイトル">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.title ?? ''}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </PropRow>
      </PropSection>

      <DataBindingSection
        fieldKey={el.dataBinding ?? ''}
        onChange={(v) => onChange({ dataBinding: v || undefined })}
        title="データソース"
        label="配列フィールドキー"
      />

      <PropSection title="軸設定">
        <PropRow label={isPieType ? 'ラベルキー' : 'X軸キー'}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.xAxisKey ?? ''}
            placeholder="例: name"
            onChange={(e) => onChange({ xAxisKey: e.target.value || undefined })}
          />
        </PropRow>
        <PropRow label={isPieType ? '値キー' : 'Y軸キー（カンマ区切り）'}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={(el.yAxisKeys ?? []).join(', ')}
            placeholder={isPieType ? '例: value' : '例: revenue, cost'}
            onChange={(e) => {
              const keys = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              onChange({ yAxisKeys: keys.length > 0 ? keys : undefined })
            }}
          />
        </PropRow>
      </PropSection>

      <PropSection title="表示設定">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={el.showLegend ?? true}
            onChange={(e) => onChange({ showLegend: e.target.checked })}
          />
          <span className="text-xs">凡例を表示</span>
        </label>
        {!isPieType && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={el.showGrid ?? true}
              onChange={(e) => onChange({ showGrid: e.target.checked })}
            />
            <span className="text-xs">グリッドを表示</span>
          </label>
        )}
      </PropSection>
    </>
  )
}
