import { useTranslation } from 'react-i18next'
import type { RepeatingListElement, RepeatingListField } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: RepeatingListElement
  onChange: (patch: Partial<RepeatingListElement>) => void
}

export function RepeatingListPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <>
      <PropSection title={t('repeatingList.dataSection')}>
        <div className="rounded bg-purple-50 border border-purple-200 px-2 py-1.5 text-[10px] text-purple-700 leading-snug">
          {t('repeatingList.hint')}
        </div>
        <PropRow label={t('repeatingList.dataSourceLabel')}>
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background font-mono" value={el.dataSource} placeholder={t('repeatingList.dataSourcePlaceholder')} onChange={(e) => onChange({ dataSource: e.target.value })} />
        </PropRow>
        <PropRow label={t('repeatingList.layout')}>
          <SelectInput value={el.layout} onChange={(v) => onChange({ layout: v as RepeatingListElement['layout'] })} options={[{ value: 'vertical', label: t('repeatingList.layoutOptVertical') }, { value: 'horizontal', label: t('repeatingList.layoutOptHorizontal') }, { value: 'grid', label: t('repeatingList.layoutOptGrid') }]} />
        </PropRow>
        {el.layout === 'grid' && (
          <PropRow label={t('repeatingList.gridColumns')}><NumInput value={el.gridColumns} onChange={(v) => onChange({ gridColumns: Math.max(1, v) })} min={1} max={10} /></PropRow>
        )}
        <div className="grid grid-cols-2 gap-2">
          <PropRow label={t('repeatingList.itemWidth')}><NumInput value={el.itemWidth} onChange={(v) => onChange({ itemWidth: v })} min={5} step={1} /></PropRow>
          <PropRow label={t('repeatingList.itemHeight')}><NumInput value={el.itemHeight} onChange={(v) => onChange({ itemHeight: v })} min={5} step={1} /></PropRow>
        </div>
        <PropRow label={t('repeatingList.gap')}><NumInput value={el.gap} onChange={(v) => onChange({ gap: v })} min={0} step={0.5} unit="mm" /></PropRow>
        <PropRow label={t('repeatingList.maxItems')}><NumInput value={el.maxItems} onChange={(v) => onChange({ maxItems: Math.max(0, v) })} min={0} /></PropRow>
      </PropSection>

      <PropSection title={t('repeatingList.appearanceSection')}>
        <PropRow label={t('repeatingList.background')}><ColorInput value={el.itemBackground ?? '#ffffff'} onChange={(v) => onChange({ itemBackground: v })} /></PropRow>
        <PropRow label={t('repeatingList.borderColor')}><ColorInput value={el.borderColor ?? '#d1d5db'} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
        <PropRow label={t('repeatingList.borderWidth')}><NumInput value={el.borderWidth ?? 0.3} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
        <PropRow label={t('repeatingList.borderRadius')}><NumInput value={el.borderRadius ?? 0} onChange={(v) => onChange({ borderRadius: v })} min={0} step={0.5} unit="mm" /></PropRow>
      </PropSection>

      <PropSection title={t('repeatingList.fieldsSection')}>
        <p className="text-[10px] text-muted-foreground leading-snug">{t('repeatingList.fieldsHint')}</p>
        <div className="space-y-2">
          {el.fields.map((f, i) => (
            <div key={i} className="border rounded p-2 space-y-1.5 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">{f.isLabel ? t('repeatingList.fieldLabelLabel', { n: i + 1 }) : t('repeatingList.fieldLabelField', { n: i + 1 })}</span>
                <button className="text-[10px] text-destructive" onClick={() => onChange({ fields: el.fields.filter((_, fi) => fi !== i) })}>{t('repeatingList.delete')}</button>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input type="checkbox" checked={!!f.isLabel} onChange={(e) => { const fields = el.fields.map((cf, fi): RepeatingListField => fi === i ? { ...cf, isLabel: e.target.checked } : cf); onChange({ fields }) }} />
                {t('repeatingList.fixedLabelCheckbox')}
              </label>
              <div className="grid grid-cols-2 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{f.isLabel ? t('repeatingList.labelTextLabel') : t('repeatingList.fieldKeyLabel')}</span>
                  <input type="text" className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono" value={f.key} onChange={(e) => { const fields = el.fields.map((cf, fi): RepeatingListField => fi === i ? { ...cf, key: e.target.value } : cf); onChange({ fields }) }} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{t('repeatingList.fontSize')}</span>
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
          <button className="w-full py-1 text-xs text-purple-600 hover:underline border border-dashed rounded" onClick={() => onChange({ fields: [...el.fields, { key: 'field', x: 2, y: el.fields.length * 5 + 2, width: el.itemWidth - 4, height: 5, style: { fontSize: 3.5 } }] })}>{t('repeatingList.addField')}</button>
        </div>
      </PropSection>
    </>
  )
}
