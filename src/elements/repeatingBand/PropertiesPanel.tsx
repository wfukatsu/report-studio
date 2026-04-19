import { useState } from 'react'
import type { RepeatingBandElement, RepeatingBandField, RepeatingBandTotal, CalculationFormat } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

// ---------------------------------------------------------------------------
// Border presets
// ---------------------------------------------------------------------------

interface BorderPreset {
  label: string
  icon: string
  patch: Partial<RepeatingBandElement>
}

const BORDER_PRESETS: BorderPreset[] = [
  {
    label: '全罫線',
    icon: '▦',
    patch: { borderWidth: 0.3, headerBorderWidth: 0.3, dataBorderWidth: 0.3, columnBorderWidth: 0.3, footerBorderWidth: 0.3 },
  },
  {
    label: '外枠のみ',
    icon: '▢',
    patch: { borderWidth: 0.3, headerBorderWidth: 0, dataBorderWidth: 0, columnBorderWidth: 0, footerBorderWidth: 0 },
  },
  {
    label: '帳票標準',
    icon: '▤',
    patch: { borderWidth: 0.5, headerBorderWidth: 0.5, dataBorderWidth: 0.2, columnBorderWidth: 0.2, footerBorderWidth: 0.5 },
  },
  {
    label: 'ヘッダー太',
    icon: '▔',
    patch: { borderWidth: 0.3, headerBorderWidth: 0.5, dataBorderWidth: 0.3, columnBorderWidth: 0.3, footerBorderWidth: 0.3 },
  },
  {
    label: '合計太',
    icon: '▁',
    patch: { borderWidth: 0.3, headerBorderWidth: 0.3, dataBorderWidth: 0.3, columnBorderWidth: 0.3, footerBorderWidth: 0.5 },
  },
  {
    label: '罫線なし',
    icon: '⊘',
    patch: { borderWidth: 0, headerBorderWidth: 0, dataBorderWidth: 0, columnBorderWidth: 0, footerBorderWidth: 0 },
  },
]

interface Props {
  el: RepeatingBandElement
  onChange: (patch: Partial<RepeatingBandElement>) => void
}

const FORMAT_OPTIONS = [
  { value: '', label: 'なし' },
  { value: 'integer', label: '整数 (1,234)' },
  { value: 'decimal', label: '小数 (1,234.56)' },
  { value: 'currency_jpy', label: '通貨 (¥1,234)' },
  { value: 'currency_usd', label: '通貨 ($1,234.56)' },
  { value: 'percent', label: 'パーセント (12.3%)' },
  { value: 'comma', label: 'カンマ区切り' },
  { value: 'kanji_numeral', label: '大字 (壱百万)' },
] as const

/** Collapsible border detail settings */
function BorderDetailSettings({ el, onChange }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full py-1"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[8px]">{open ? '▼' : '▶'}</span>
        罫線の詳細設定
      </button>
      {open && (
        <div className="space-y-1 pl-2 border-l-2 border-muted">
          <PropRow label="外枠の色"><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
          <PropRow label="外枠の幅"><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label="ヘッダー下の色"><ColorInput value={el.headerBorderColor ?? el.borderColor} onChange={(v) => onChange({ headerBorderColor: v })} /></PropRow>
          <PropRow label="ヘッダー下の幅"><NumInput value={el.headerBorderWidth ?? el.innerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ headerBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label="データ行間の色"><ColorInput value={el.dataBorderColor ?? el.borderColor} onChange={(v) => onChange({ dataBorderColor: v })} /></PropRow>
          <PropRow label="データ行間の幅"><NumInput value={el.dataBorderWidth ?? el.innerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ dataBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label="列区切りの色"><ColorInput value={el.columnBorderColor ?? el.borderColor} onChange={(v) => onChange({ columnBorderColor: v })} /></PropRow>
          <PropRow label="列区切りの幅"><NumInput value={el.columnBorderWidth ?? el.innerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ columnBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label="フッター上の色"><ColorInput value={el.footerBorderColor ?? el.borderColor} onChange={(v) => onChange({ footerBorderColor: v })} /></PropRow>
          <PropRow label="フッター上の幅"><NumInput value={el.footerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ footerBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
        </div>
      )}
    </div>
  )
}

export function RepeatingBandPropertiesPanel({ el, onChange }: Props) {
  /** Update a single field in the fields array immutably */
  function updateField(index: number, patch: Partial<RepeatingBandField>) {
    const fields = el.fields.map((f, i): RepeatingBandField =>
      i === index ? { ...f, ...patch } : f,
    )
    onChange({ fields })
  }

  /** Move a field up or down in the list */
  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= el.fields.length) return
    const fields = [...el.fields]
    const tmp = fields[index]
    fields[index] = fields[target]
    fields[target] = tmp
    onChange({ fields })
  }

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
        {el.showFooter && (
          <PropRow label="フッター配置">
            <SelectInput
              value={el.footerLayout ?? 'fixed'}
              onChange={(v) => onChange({ footerLayout: v as 'compact' | 'fixed' })}
              options={[
                { value: 'fixed', label: '下端に固定' },
                { value: 'compact', label: 'データ行に詰める' },
              ]}
            />
          </PropRow>
        )}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.showEmptyRowLines ?? false} onChange={(e) => onChange({ showEmptyRowLines: e.target.checked })} className="rounded" />空行罫線を表示 (最大件数まで)
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.wrapText ?? false} onChange={(e) => onChange({ wrapText: e.target.checked })} className="rounded" />セル内テキストを折り返す
        </label>
        <PropRow label="ヘッダー行の高さ (mm)">
          <NumInput value={el.headerHeight ?? el.itemHeight} onChange={(v) => onChange({ headerHeight: v })} min={3} step={0.5} unit="mm" />
        </PropRow>
      </PropSection>

      <PropSection title="繰り返しバンド — 列定義">
        <div className="space-y-2">
          {el.fields.map((f, i) => (
            <div key={i} className="border rounded p-2 space-y-1.5 bg-muted/30">
              <div className="flex items-center gap-1 justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">列 {i + 1}</span>
                <div className="flex items-center gap-1">
                  {/* Move up/down buttons */}
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => moveField(i, -1)}
                    title="上に移動"
                  >↑</button>
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === el.fields.length - 1}
                    onClick={() => moveField(i, 1)}
                    title="下に移動"
                  >↓</button>
                  <button className="text-[10px] text-destructive hover:underline" onClick={() => onChange({ fields: el.fields.filter((_, ci) => ci !== i) })}>削除</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">フィールドキー</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={f.key} placeholder="field.key" onChange={(e) => updateField(i, { key: e.target.value })} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">ヘッダーラベル</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">幅 (mm)</span>
                  <input type="number" min={5} step={1} className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f.width} onChange={(e) => updateField(i, { width: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">横揃え</span>
                  <select className="border rounded px-1 py-0.5 text-xs bg-background" value={f.align ?? 'left'} onChange={(e) => updateField(i, { align: e.target.value as RepeatingBandField['align'] })}>
                    <option value="left">左</option><option value="center">中央</option><option value="right">右</option>
                  </select>
                </label>
              </div>
              {/* Format setting */}
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">書式</span>
                <select
                  className="border rounded px-1 py-0.5 text-xs bg-background"
                  value={f.format?.type ?? ''}
                  onChange={(e) => {
                    const type = e.target.value
                    if (!type) {
                      updateField(i, { format: undefined })
                    } else {
                      const fmt: CalculationFormat = { type: type as CalculationFormat['type'] }
                      if (type === 'decimal' || type === 'currency_usd') fmt.decimalPlaces = 2
                      updateField(i, { format: fmt })
                    }
                  }}
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              {/* Decimal places (for decimal/currency formats) */}
              {f.format && (f.format.type === 'decimal' || f.format.type === 'currency_usd') && (
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">小数桁数</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    className="border rounded px-1.5 py-0.5 text-xs bg-background w-20"
                    value={f.format.decimalPlaces ?? 2}
                    onChange={(e) => updateField(i, { format: { ...f.format!, decimalPlaces: Number(e.target.value) } })}
                  />
                </label>
              )}
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

      <PropSection title="繰り返しバンド — 罫線">
        <div className="space-y-2">
          <span className="text-[10px] text-muted-foreground font-medium">プリセット</span>
          <div className="grid grid-cols-3 gap-1">
            {BORDER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-xs"
                onClick={() => onChange(preset.patch)}
                title={preset.label}
              >
                <span className="text-base leading-none">{preset.icon}</span>
                <span className="text-[9px] leading-tight">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
        <BorderDetailSettings el={el} onChange={onChange} />
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
      </PropSection>

      <PropSection title="繰り返しバンド — ページ">
        <PropRow label="改ページ">
          <SelectInput
            value={el.pageBreak ?? 'none'}
            onChange={(v) => onChange({ pageBreak: v === 'none' ? undefined : v as 'before' | 'after' })}
            options={[
              { value: 'none', label: 'なし' },
              { value: 'before', label: 'バンド前に改ページ' },
              { value: 'after', label: 'バンド後に改ページ' },
            ]}
          />
        </PropRow>
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
