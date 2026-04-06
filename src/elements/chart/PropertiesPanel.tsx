import type { ChartElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ChartElement
  onChange: (patch: Partial<ChartElement>) => void
}

export function ChartPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="グラフ">
      <PropRow label="グラフ種別">
        <SelectInput value={el.chartType} onChange={(v) => onChange({ chartType: v as ChartElement['chartType'] })} options={[{ value: 'bar', label: '棒グラフ' }, { value: 'line', label: '折れ線グラフ' }, { value: 'pie', label: '円グラフ' }, { value: 'donut', label: 'ドーナツグラフ' }]} />
      </PropRow>
      <PropRow label="タイトル">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </PropRow>
      <PropRow label="データバインド">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.dataBinding ?? ''} placeholder="例: chartData" onChange={(e) => onChange({ dataBinding: e.target.value || undefined })} />
      </PropRow>
    </PropSection>
  )
}
