import { useTranslation } from 'react-i18next'
import type { ChartElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'
import { DataBindingSection } from '@/elements/_blocks/panels/DataBindingSection'

interface Props {
  el: ChartElement
  onChange: (patch: Partial<ChartElement>) => void
}

export function ChartPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const isPieType = el.chartType === 'pie' || el.chartType === 'donut'

  return (
    <>
      <PropSection title={t('chart.section')}>
        <PropRow label={t('chart.chartType')}>
          <SelectInput
            value={el.chartType}
            onChange={(v) => onChange({ chartType: v as ChartElement['chartType'] })}
            options={[
              { value: 'bar', label: t('chart.typeBar') },
              { value: 'line', label: t('chart.typeLine') },
              { value: 'pie', label: t('chart.typePie') },
              { value: 'donut', label: t('chart.typeDonut') },
            ]}
          />
        </PropRow>
        <PropRow label={t('chart.title')}>
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
        title={t('chart.dataSource')}
        label={t('chart.arrayFieldKey')}
      />

      <PropSection title={t('chart.axisSection')}>
        <PropRow label={isPieType ? t('chart.labelKey') : t('chart.xAxisKey')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.xAxisKey ?? ''}
            placeholder={t('chart.xAxisPlaceholder')}
            onChange={(e) => onChange({ xAxisKey: e.target.value || undefined })}
          />
        </PropRow>
        <PropRow label={isPieType ? t('chart.valueKey') : t('chart.yAxisKey')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={(el.yAxisKeys ?? []).join(', ')}
            placeholder={isPieType ? t('chart.valueKeyPlaceholder') : t('chart.yAxisPlaceholder')}
            onChange={(e) => {
              const keys = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              onChange({ yAxisKeys: keys.length > 0 ? keys : undefined })
            }}
          />
        </PropRow>
      </PropSection>

      <PropSection title={t('chart.displaySection')}>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={el.showLegend ?? true}
            onChange={(e) => onChange({ showLegend: e.target.checked })}
          />
          <span className="text-xs">{t('chart.showLegend')}</span>
        </label>
        {!isPieType && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={el.showGrid ?? true}
              onChange={(e) => onChange({ showGrid: e.target.checked })}
            />
            <span className="text-xs">{t('chart.showGrid')}</span>
          </label>
        )}
      </PropSection>
    </>
  )
}
