import type { RepeatingBandElement, RepeatingBandField, RepeatingBandTotal } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: RepeatingBandElement
  onChange: (patch: Partial<RepeatingBandElement>) => void
}

export function RepeatingBandPropertiesPanel({ el, onChange }: Props) {
  return (
    <>
      <PropSection title="繰り返しバンド — データ">
        <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] text-blue-700 leading-snug">
          バンド内のフィールドがデータ配列の件数分、縦に繰り返されます。
        </div>
        <PropRow label="データソース (配列フィールドキー)">
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.dataSource} placeholder="例: items, records" onChange={(e) => onChange({ dataSource: e.target.value })} />
        </PropRow>
        <PropRow label="1行の高さ"><NumInput value={el.itemHeight} onChange={(v) => onChange({ itemHeight: v })} min={3} step={0.5} unit="mm" /></PropRow>
        <PropRow label="最大件数 (0=無制限)"><NumInput value={el.maxItems} onChange={(v) => onChange({ maxItems: Math.max(0, v) })} min={0} /></PropRow>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={el.showHeader} onChange={(e) => onChange({ showHeader: e.target.checked })} className="rounded" />ヘッダー行
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={el.showFooter} onChange={(e) => onChange({ showFooter: e.target.checked })} className="rounded" />フッター（集計）行
          </label>
        </div>
      </PropSection>

      <PropSection title="繰り返しバンド — 列定義">
        <div className="space-y-2">
          {el.fields.map((f, i) => (
            <div key={i} className="border rounded p-2 space-y-1.5 bg-muted/30">
              <div className="flex items-center gap-1 justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">列 {i + 1}</span>
                <button className="text-[10px] text-destructive hover:underline" onClick={() => onChange({ fields: el.fields.filter((_, ci) => ci !== i) })}>削除</button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">フィールドキー</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={f.key} placeholder="field.key" onChange={(e) => { const fields = el.fields.map((cf, ci): RepeatingBandField => ci === i ? { ...cf, key: e.target.value } : cf); onChange({ fields }) }} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">ヘッダーラベル</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f.label} onChange={(e) => { const fields = el.fields.map((cf, ci): RepeatingBandField => ci === i ? { ...cf, label: e.target.value } : cf); onChange({ fields }) }} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">幅 (mm)</span>
                  <input type="number" min={5} step={1} className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f.width} onChange={(e) => { const fields = el.fields.map((cf, ci): RepeatingBandField => ci === i ? { ...cf, width: Number(e.target.value) } : cf); onChange({ fields }) }} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">横揃え</span>
                  <select className="border rounded px-1 py-0.5 text-xs bg-background" value={f.align ?? 'left'} onChange={(e) => { const fields = el.fields.map((cf, ci): RepeatingBandField => ci === i ? { ...cf, align: e.target.value as RepeatingBandField['align'] } : cf); onChange({ fields }) }}>
                    <option value="left">左</option><option value="center">中央</option><option value="right">右</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
          <button className="w-full py-1 text-xs text-blue-600 hover:underline border border-dashed rounded" onClick={() => onChange({ fields: [...el.fields, { key: 'field', label: '新列', width: 20, align: 'left' }] })}>＋ 列を追加</button>
        </div>
      </PropSection>

      <PropSection title="繰り返しバンド — ソート・グループ">
        <PropRow label="ソートフィールドキー">
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.sortBy ?? ''} placeholder="例: date, amount" onChange={(e) => onChange({ sortBy: e.target.value || undefined })} />
        </PropRow>
        <PropRow label="ソート順">
          <SelectInput value={el.sortOrder ?? 'asc'} onChange={(v) => onChange({ sortOrder: v as 'asc' | 'desc' })} options={[{ value: 'asc', label: '昇順 (A→Z)' }, { value: 'desc', label: '降順 (Z→A)' }]} />
        </PropRow>
        <PropRow label="グループ化フィールドキー">
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.groupBy ?? ''} placeholder="例: category, system_name" onChange={(e) => onChange({ groupBy: e.target.value || undefined })} />
        </PropRow>
        {el.groupBy && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={el.showGroupSubtotals ?? false} onChange={(e) => onChange({ showGroupSubtotals: e.target.checked })} className="rounded" />グループ小計行を表示
          </label>
        )}
      </PropSection>

      <PropSection title="繰り返しバンド — 外観">
        {el.showHeader && (
          <>
            <PropRow label="ヘッダー背景色"><ColorInput value={el.headerStyle?.backgroundColor ?? '#f3f4f6'} onChange={(v) => onChange({ headerStyle: { ...el.headerStyle, backgroundColor: v } })} /></PropRow>
            <PropRow label="ヘッダー文字色"><ColorInput value={el.headerStyle?.color ?? '#1a1a1a'} onChange={(v) => onChange({ headerStyle: { ...el.headerStyle, color: v } })} /></PropRow>
          </>
        )}
        <PropRow label="奇数行の背景色"><ColorInput value={el.oddRowColor} onChange={(v) => onChange({ oddRowColor: v })} /></PropRow>
        <PropRow label="偶数行の背景色（縞模様）"><ColorInput value={el.evenRowColor} onChange={(v) => onChange({ evenRowColor: v })} /></PropRow>
        <PropRow label="枠線色"><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
        <PropRow label="枠線幅"><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      </PropSection>

      {el.showFooter && (
        <PropSection title="繰り返しバンド — 集計（フッター）">
          <div className="space-y-1.5">
            {el.totals.map((t, i) => (
              <div key={i} className="border rounded p-2 space-y-1 bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-muted-foreground">集計 {i + 1}</span>
                  <button className="text-[10px] text-destructive" onClick={() => onChange({ totals: el.totals.filter((_, ti) => ti !== i) })}>削除</button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">フィールドキー</span>
                    <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={t.fieldKey} onChange={(e) => { const totals = el.totals.map((ct, ti): RepeatingBandTotal => ti === i ? { ...ct, fieldKey: e.target.value } : ct); onChange({ totals }) }} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">集計関数</span>
                    <select className="border rounded px-1 py-0.5 text-xs bg-background" value={t.formula} onChange={(e) => { const totals = el.totals.map((ct, ti): RepeatingBandTotal => ti === i ? { ...ct, formula: e.target.value as RepeatingBandTotal['formula'] } : ct); onChange({ totals }) }}>
                      <option value="sum">SUM (合計)</option><option value="count">COUNT (件数)</option><option value="avg">AVG (平均)</option><option value="min">MIN (最小)</option><option value="max">MAX (最大)</option>
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">ラベル</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background" value={t.label ?? ''} placeholder="例: 合計金額" onChange={(e) => { const totals = el.totals.map((ct, ti): RepeatingBandTotal => ti === i ? { ...ct, label: e.target.value || undefined } : ct); onChange({ totals }) }} />
                </label>
              </div>
            ))}
            <button className="w-full py-1 text-xs text-blue-600 hover:underline border border-dashed rounded" onClick={() => onChange({ totals: [...el.totals, { fieldKey: 'amount', formula: 'sum', label: '合計' }] })}>＋ 集計を追加</button>
          </div>
        </PropSection>
      )}
    </>
  )
}
