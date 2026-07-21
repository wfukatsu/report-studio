import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import type { RepeatingBandElement, RepeatingBandField, RepeatingBandTotal, CalculationFormat } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { useReportStore } from '@/store'
import { isSystemGroup } from '@/store/systemGroups'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Border presets
// ---------------------------------------------------------------------------

interface BorderPreset {
  labelKey: ParseKeys<'elements'>
  icon: string
  patch: Partial<RepeatingBandElement>
}

const BORDER_PRESETS: BorderPreset[] = [
  {
    labelKey: 'repeatingBand.borderPreset.all',
    icon: '▦',
    patch: { borderWidth: 0.3, headerBorderWidth: 0.3, dataBorderWidth: 0.3, columnBorderWidth: 0.3, footerBorderWidth: 0.3 },
  },
  {
    labelKey: 'repeatingBand.borderPreset.outerOnly',
    icon: '▢',
    patch: { borderWidth: 0.3, headerBorderWidth: 0, dataBorderWidth: 0, columnBorderWidth: 0, footerBorderWidth: 0 },
  },
  {
    labelKey: 'repeatingBand.borderPreset.standard',
    icon: '▤',
    patch: { borderWidth: 0.5, headerBorderWidth: 0.5, dataBorderWidth: 0.2, columnBorderWidth: 0.2, footerBorderWidth: 0.5 },
  },
  {
    labelKey: 'repeatingBand.borderPreset.headerBold',
    icon: '▔',
    patch: { borderWidth: 0.3, headerBorderWidth: 0.5, dataBorderWidth: 0.3, columnBorderWidth: 0.3, footerBorderWidth: 0.3 },
  },
  {
    labelKey: 'repeatingBand.borderPreset.footerBold',
    icon: '▁',
    patch: { borderWidth: 0.3, headerBorderWidth: 0.3, dataBorderWidth: 0.3, columnBorderWidth: 0.3, footerBorderWidth: 0.5 },
  },
  {
    labelKey: 'repeatingBand.borderPreset.none',
    icon: '⊘',
    patch: { borderWidth: 0, headerBorderWidth: 0, dataBorderWidth: 0, columnBorderWidth: 0, footerBorderWidth: 0 },
  },
]

interface Props {
  el: RepeatingBandElement
  onChange: (patch: Partial<RepeatingBandElement>) => void
}

const FORMAT_OPTIONS = [
  { value: '', labelKey: 'repeatingBand.formatOption.none' },
  { value: 'integer', labelKey: 'repeatingBand.formatOption.integer' },
  { value: 'decimal', labelKey: 'repeatingBand.formatOption.decimal' },
  { value: 'currency_jpy', labelKey: 'repeatingBand.formatOption.currencyJpy' },
  { value: 'currency_usd', labelKey: 'repeatingBand.formatOption.currencyUsd' },
  { value: 'percent', labelKey: 'repeatingBand.formatOption.percent' },
  { value: 'comma', labelKey: 'repeatingBand.formatOption.comma' },
  { value: 'kanji_numeral', labelKey: 'repeatingBand.formatOption.kanjiNumeral' },
] as const satisfies readonly { value: string; labelKey: string }[]

/**
 * #140: data-source picker — a dropdown of real detail (array) schema groups,
 * replacing the old free-text input that had to string-match a group's dataKey.
 * Surfaces an explicit error when nothing is selected or the value points at a
 * non-existent group (avoids a silently empty band).
 */
function DataSourceSelect({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const schema = useReportStore((s) => s.definition.schema)
  const detailGroups = useMemo(
    () =>
      (schema?.groups ?? [])
        .filter((g) => !isSystemGroup(g.id) && g.role === 'detail')
        .map((g) => ({ dataKey: g.dataKey, label: g.label || g.dataKey })),
    [schema],
  )

  const current = el.dataSource ?? ''
  const matches = detailGroups.some((g) => g.dataKey === current)
  const isError = !current || !matches
  const noDetailGroups = detailGroups.length === 0

  return (
    <PropRow label={t('repeatingBand.dataSource')}>
      <div className="w-full">
        <select
          className={cn(
            'border rounded px-2 py-1 text-xs w-full bg-background',
            isError && 'border-red-300 text-red-600',
          )}
          value={current}
          onChange={(e) => onChange({ dataSource: e.target.value })}
          aria-label={t('repeatingBand.dataSource')}
        >
          <option value="">{t('repeatingBand.unselected')}</option>
          {detailGroups.map((g) => (
            <option key={g.dataKey} value={g.dataKey}>
              {g.label}（{g.dataKey}）
            </option>
          ))}
          {/* Preserve an unknown/legacy value so it isn't silently discarded. */}
          {current && !matches && <option value={current}>{t('repeatingBand.unknownOption', { value: current })}</option>}
        </select>
        {noDetailGroups ? (
          <p className="mt-0.5 text-[10px] leading-tight text-amber-600">
            {t('repeatingBand.noDetailGroups')}
          </p>
        ) : isError ? (
          <p className="mt-0.5 text-[10px] leading-tight text-red-500">
            {current
              ? t('repeatingBand.dataSourceNoMatch', { value: current })
              : t('repeatingBand.dataSourceUnselectedError')}
          </p>
        ) : null}
      </div>
    </PropRow>
  )
}

/** Collapsible border detail settings */
function BorderDetailSettings({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full py-1"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[8px]">{open ? '▼' : '▶'}</span>
        {t('repeatingBand.borderDetailSettings')}
      </button>
      {open && (
        <div className="space-y-1 pl-2 border-l-2 border-muted">
          <PropRow label={t('repeatingBand.outerBorderColor')}><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
          <PropRow label={t('repeatingBand.outerBorderWidth')}><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label={t('repeatingBand.headerBorderColor')}><ColorInput value={el.headerBorderColor ?? el.borderColor} onChange={(v) => onChange({ headerBorderColor: v })} /></PropRow>
          <PropRow label={t('repeatingBand.headerBorderWidth')}><NumInput value={el.headerBorderWidth ?? el.innerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ headerBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label={t('repeatingBand.dataBorderColor')}><ColorInput value={el.dataBorderColor ?? el.borderColor} onChange={(v) => onChange({ dataBorderColor: v })} /></PropRow>
          <PropRow label={t('repeatingBand.dataBorderWidth')}><NumInput value={el.dataBorderWidth ?? el.innerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ dataBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label={t('repeatingBand.columnBorderColor')}><ColorInput value={el.columnBorderColor ?? el.borderColor} onChange={(v) => onChange({ columnBorderColor: v })} /></PropRow>
          <PropRow label={t('repeatingBand.columnBorderWidth')}><NumInput value={el.columnBorderWidth ?? el.innerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ columnBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
          <PropRow label={t('repeatingBand.footerBorderColor')}><ColorInput value={el.footerBorderColor ?? el.borderColor} onChange={(v) => onChange({ footerBorderColor: v })} /></PropRow>
          <PropRow label={t('repeatingBand.footerBorderWidth')}><NumInput value={el.footerBorderWidth ?? el.borderWidth} onChange={(v) => onChange({ footerBorderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
        </div>
      )}
    </div>
  )
}

export function RepeatingBandPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
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
      <PropSection title={t('repeatingBand.sectionData')}>
        <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] text-blue-700 leading-snug">
          {t('repeatingBand.dataHint')}
        </div>
        <DataSourceSelect el={el} onChange={onChange} />
        <PropRow label={t('repeatingBand.rowHeight')}><NumInput value={el.itemHeight} onChange={(v) => onChange({ itemHeight: v })} min={3} step={0.5} unit="mm" /></PropRow>
        <PropRow label={t('repeatingBand.maxItems')}><NumInput value={el.maxItems} onChange={(v) => onChange({ maxItems: Math.max(0, v) })} min={0} /></PropRow>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={el.showHeader} onChange={(e) => onChange({ showHeader: e.target.checked })} className="rounded" />{t('repeatingBand.headerRow')}
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={el.showFooter} onChange={(e) => onChange({ showFooter: e.target.checked })} className="rounded" />{t('repeatingBand.footerRow')}
          </label>
        </div>
        {el.showFooter && (
          <PropRow label={t('repeatingBand.footerLayout')}>
            <SelectInput
              value={el.footerLayout ?? 'fixed'}
              onChange={(v) => onChange({ footerLayout: v as 'compact' | 'fixed' })}
              options={[
                { value: 'fixed', label: t('repeatingBand.footerLayoutFixed') },
                { value: 'compact', label: t('repeatingBand.footerLayoutCompact') },
              ]}
            />
          </PropRow>
        )}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.showEmptyRowLines ?? false} onChange={(e) => onChange({ showEmptyRowLines: e.target.checked })} className="rounded" />{t('repeatingBand.showEmptyRowLines')}
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.wrapText ?? false} onChange={(e) => onChange({ wrapText: e.target.checked })} className="rounded" />{t('repeatingBand.wrapText')}
        </label>
        <PropRow label={t('repeatingBand.headerHeight')}>
          <NumInput value={el.headerHeight ?? el.itemHeight} onChange={(v) => onChange({ headerHeight: v })} min={3} step={0.5} unit="mm" />
        </PropRow>
      </PropSection>

      <PropSection title={t('repeatingBand.sectionColumns')}>
        <div className="space-y-2">
          {el.fields.map((f, i) => (
            <div key={i} className="border rounded p-2 space-y-1.5 bg-muted/30">
              <div className="flex items-center gap-1 justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">{t('repeatingBand.columnN', { n: i + 1 })}</span>
                <div className="flex items-center gap-1">
                  {/* Move up/down buttons */}
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => moveField(i, -1)}
                    title={t('repeatingBand.moveUp')}
                  >↑</button>
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === el.fields.length - 1}
                    onClick={() => moveField(i, 1)}
                    title={t('repeatingBand.moveDown')}
                  >↓</button>
                  <button className="text-[10px] text-destructive hover:underline" onClick={() => onChange({ fields: el.fields.filter((_, ci) => ci !== i) })}>{t('repeatingBand.delete')}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingBand.fieldKey')}</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={f.key} placeholder="field.key" onChange={(e) => updateField(i, { key: e.target.value })} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingBand.headerLabel')}</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingBand.widthMm')}</span>
                  <input type="number" min={5} step={1} className="border rounded px-1.5 py-0.5 text-xs bg-background" value={f.width} onChange={(e) => updateField(i, { width: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingBand.horizontalAlign')}</span>
                  <select className="border rounded px-1 py-0.5 text-xs bg-background" value={f.align ?? 'left'} onChange={(e) => updateField(i, { align: e.target.value as RepeatingBandField['align'] })}>
                    <option value="left">{t('repeatingBand.alignLeft')}</option><option value="center">{t('repeatingBand.alignCenter')}</option><option value="right">{t('repeatingBand.alignRight')}</option>
                  </select>
                </label>
              </div>
              {/* Format setting */}
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{t('repeatingBand.format')}</span>
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
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
              </label>
              {/* Decimal places (for decimal/currency formats) */}
              {f.format && (f.format.type === 'decimal' || f.format.type === 'currency_usd') && (
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingBand.decimalPlaces')}</span>
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
          <button className="w-full py-1 text-xs text-blue-600 hover:underline border border-dashed rounded" onClick={() => onChange({ fields: [...el.fields, { key: 'field', label: '新列', width: 20, align: 'left' }] })}>{t('repeatingBand.addColumn')}</button>
        </div>
      </PropSection>

      <PropSection title={t('repeatingBand.sectionSortGroup')}>
        <PropRow label={t('repeatingBand.sortFieldKey')}>
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.sortBy ?? ''} placeholder={t('repeatingBand.sortFieldKeyPlaceholder')} onChange={(e) => onChange({ sortBy: e.target.value || undefined })} />
        </PropRow>
        <PropRow label={t('repeatingBand.sortOrder')}>
          <SelectInput value={el.sortOrder ?? 'asc'} onChange={(v) => onChange({ sortOrder: v as 'asc' | 'desc' })} options={[{ value: 'asc', label: t('repeatingBand.sortAsc') }, { value: 'desc', label: t('repeatingBand.sortDesc') }]} />
        </PropRow>
        <PropRow label={t('repeatingBand.groupByFieldKey')}>
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.groupBy ?? ''} placeholder={t('repeatingBand.groupByPlaceholder')} onChange={(e) => onChange({ groupBy: e.target.value || undefined })} />
        </PropRow>
        {el.groupBy && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={el.showGroupSubtotals ?? false} onChange={(e) => onChange({ showGroupSubtotals: e.target.checked })} className="rounded" />{t('repeatingBand.showGroupSubtotals')}
          </label>
        )}
      </PropSection>

      <PropSection title={t('repeatingBand.sectionBorders')}>
        <div className="space-y-2">
          <span className="text-[10px] text-muted-foreground font-medium">{t('repeatingBand.presets')}</span>
          <div className="grid grid-cols-3 gap-1">
            {BORDER_PRESETS.map((preset) => (
              <button
                key={preset.labelKey}
                className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-xs"
                onClick={() => onChange(preset.patch)}
                title={t(preset.labelKey)}
              >
                <span className="text-base leading-none">{preset.icon}</span>
                <span className="text-[9px] leading-tight">{t(preset.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
        <BorderDetailSettings el={el} onChange={onChange} />
      </PropSection>

      <PropSection title={t('repeatingBand.sectionAppearance')}>
        {el.showHeader && (
          <>
            <PropRow label={t('repeatingBand.headerBgColor')}><ColorInput value={el.headerStyle?.backgroundColor ?? '#f3f4f6'} onChange={(v) => onChange({ headerStyle: { ...el.headerStyle, backgroundColor: v } })} /></PropRow>
            <PropRow label={t('repeatingBand.headerTextColor')}><ColorInput value={el.headerStyle?.color ?? '#1a1a1a'} onChange={(v) => onChange({ headerStyle: { ...el.headerStyle, color: v } })} /></PropRow>
          </>
        )}
        <PropRow label={t('repeatingBand.oddRowColor')}><ColorInput value={el.oddRowColor} onChange={(v) => onChange({ oddRowColor: v })} /></PropRow>
        <PropRow label={t('repeatingBand.evenRowColor')}><ColorInput value={el.evenRowColor} onChange={(v) => onChange({ evenRowColor: v })} /></PropRow>
      </PropSection>

      <PropSection title={t('repeatingBand.sectionPage')}>
        <PropRow label={t('repeatingBand.pageBreak')}>
          <SelectInput
            value={el.pageBreak ?? 'none'}
            onChange={(v) => onChange({ pageBreak: v === 'none' ? undefined : v as 'before' | 'after' })}
            options={[
              { value: 'none', label: t('repeatingBand.pageBreakNone') },
              { value: 'before', label: t('repeatingBand.pageBreakBefore') },
              { value: 'after', label: t('repeatingBand.pageBreakAfter') },
            ]}
          />
        </PropRow>
      </PropSection>

      {el.showFooter && (
        <PropSection title={t('repeatingBand.sectionAggregate')}>
          <div className="space-y-1.5">
            {el.totals.map((total, i) => (
              <div key={i} className="border rounded p-2 space-y-1 bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-muted-foreground">{t('repeatingBand.aggregateN', { n: i + 1 })}</span>
                  <button className="text-[10px] text-destructive" onClick={() => onChange({ totals: el.totals.filter((_, ti) => ti !== i) })}>{t('repeatingBand.delete')}</button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{t('repeatingBand.fieldKey')}</span>
                    <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={total.fieldKey} onChange={(e) => { const totals = el.totals.map((ct, ti): RepeatingBandTotal => ti === i ? { ...ct, fieldKey: e.target.value } : ct); onChange({ totals }) }} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{t('repeatingBand.aggregateFormula')}</span>
                    <select className="border rounded px-1 py-0.5 text-xs bg-background" value={total.formula} onChange={(e) => { const totals = el.totals.map((ct, ti): RepeatingBandTotal => ti === i ? { ...ct, formula: e.target.value as RepeatingBandTotal['formula'] } : ct); onChange({ totals }) }}>
                      <option value="sum">{t('repeatingBand.formula.sum')}</option><option value="count">{t('repeatingBand.formula.count')}</option><option value="avg">{t('repeatingBand.formula.avg')}</option><option value="min">{t('repeatingBand.formula.min')}</option><option value="max">{t('repeatingBand.formula.max')}</option>
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingBand.label')}</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background" value={total.label ?? ''} placeholder={t('repeatingBand.aggregateLabelPlaceholder')} onChange={(e) => { const totals = el.totals.map((ct, ti): RepeatingBandTotal => ti === i ? { ...ct, label: e.target.value || undefined } : ct); onChange({ totals }) }} />
                </label>
              </div>
            ))}
            <button className="w-full py-1 text-xs text-blue-600 hover:underline border border-dashed rounded" onClick={() => onChange({ totals: [...el.totals, { fieldKey: 'amount', formula: 'sum', label: '合計' }] })}>{t('repeatingBand.addAggregate')}</button>
          </div>
        </PropSection>
      )}
    </>
  )
}
