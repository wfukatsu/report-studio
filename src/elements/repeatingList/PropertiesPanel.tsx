import type { RepeatingListElement, RepeatingListField } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: RepeatingListElement
  onChange: (patch: Partial<RepeatingListElement>) => void
}

export function RepeatingListPropertiesPanel({ el, onChange }: Props) {
  return (
    <>
      <PropSection title="繰り返しリスト — データ">
        <div className="rounded bg-purple-50 border border-purple-200 px-2 py-1.5 text-[10px] text-purple-700 leading-snug">
          カード・ラベル形式でデータを繰り返し表示します。
        </div>
        <PropRow label="データソース (配列フィールドキー)">
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.dataSource} placeholder="例: employees, products" onChange={(e) => onChange({ dataSource: e.target.value })} />
        </PropRow>
        <PropRow label="レイアウト">
          <SelectInput value={el.layout} onChange={(v) => onChange({ layout: v as RepeatingListElement['layout'] })} options={[{ value: 'vertical', label: '縦並び (リスト形式)' }, { value: 'horizontal', label: '横並び (水平スクロール)' }, { value: 'grid', label: 'グリッド (N列)' }]} />
        </PropRow>
        {el.layout === 'grid' && (
          <PropRow label="グリッド列数"><NumInput value={el.gridColumns} onChange={(v) => onChange({ gridColumns: Math.max(1, v) })} min={1} max={10} /></PropRow>
        )}
        <div className="grid grid-cols-2 gap-2">
          <PropRow label="アイテム幅 (mm)"><NumInput value={el.itemWidth} onChange={(v) => onChange({ itemWidth: v })} min={5} step={1} /></PropRow>
          <PropRow label="アイテム高さ (mm)"><NumInput value={el.itemHeight} onChange={(v) => onChange({ itemHeight: v })} min={5} step={1} /></PropRow>
        </div>
        <PropRow label="間隔 (gap)"><NumInput value={el.gap} onChange={(v) => onChange({ gap: v })} min={0} step={0.5} unit="mm" /></PropRow>
        <PropRow label="最大件数 (0=無制限)"><NumInput value={el.maxItems} onChange={(v) => onChange({ maxItems: Math.max(0, v) })} min={0} /></PropRow>
      </PropSection>

      <PropSection title="繰り返しリスト — アイテム外観">
        <PropRow label="背景色"><ColorInput value={el.itemBackground ?? '#ffffff'} onChange={(v) => onChange({ itemBackground: v })} /></PropRow>
        <PropRow label="枠線色"><ColorInput value={el.borderColor ?? '#d1d5db'} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
        <PropRow label="枠線幅"><NumInput value={el.borderWidth ?? 0.3} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
        <PropRow label="角丸"><NumInput value={el.borderRadius ?? 0} onChange={(v) => onChange({ borderRadius: v })} min={0} step={0.5} unit="mm" /></PropRow>
      </PropSection>

      <PropSection title="繰り返しリスト — フィールド定義">
        <p className="text-[10px] text-muted-foreground leading-snug">各アイテムカード内のフィールドを定義します。位置はアイテム左上からの相対座標です。</p>
        <div className="space-y-2">
          {el.fields.map((f, i) => (
            <div key={i} className="border rounded p-2 space-y-1.5 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">{f.isLabel ? 'ラベル' : 'フィールド'} {i + 1}</span>
                <button className="text-[10px] text-destructive" onClick={() => onChange({ fields: el.fields.filter((_, fi) => fi !== i) })}>削除</button>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input type="checkbox" checked={!!f.isLabel} onChange={(e) => { const fields = el.fields.map((cf, fi): RepeatingListField => fi === i ? { ...cf, isLabel: e.target.checked } : cf); onChange({ fields }) }} />
                固定ラベル（繰り返さない）
              </label>
              <div className="grid grid-cols-2 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{f.isLabel ? 'ラベルテキスト' : 'フィールドキー'}</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={f.key} onChange={(e) => { const fields = el.fields.map((cf, fi): RepeatingListField => fi === i ? { ...cf, key: e.target.value } : cf); onChange({ fields }) }} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">フォントサイズ</span>
                  <div className="flex items-center gap-0.5">
                    <input type="number" min={1} step={0.5} className="border rounded px-1.5 py-0.5 text-xs bg-background w-full" value={f.style?.fontSize ?? 3.5} onChange={(e) => { const fields = el.fields.map((cf, fi): RepeatingListField => fi === i ? { ...cf, style: { ...cf.style, fontSize: Number(e.target.value) } } : cf); onChange({ fields }) }} />
                    <span className="text-[9px] text-muted-foreground shrink-0">mm</span>
                  </div>
                </label>
                {(['x', 'y', 'width', 'height'] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{k.toUpperCase()} (mm)</span>
                    <input type="number" min={k === 'width' || k === 'height' ? 1 : 0} step={0.5} className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f[k]} onChange={(e) => { const fields = el.fields.map((cf, fi): RepeatingListField => fi === i ? { ...cf, [k]: Number(e.target.value) } : cf); onChange({ fields }) }} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button className="w-full py-1 text-xs text-purple-600 hover:underline border border-dashed rounded" onClick={() => onChange({ fields: [...el.fields, { key: 'field', x: 2, y: el.fields.length * 5 + 2, width: el.itemWidth - 4, height: 5, style: { fontSize: 3.5 } }] })}>＋ フィールドを追加</button>
        </div>
      </PropSection>
    </>
  )
}
