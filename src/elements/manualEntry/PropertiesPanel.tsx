import { useTranslation } from 'react-i18next'
import type { ManualEntryField } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ManualEntryField
  onChange: (patch: Partial<ManualEntryField>) => void
}

export function ManualEntryPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <>
      <PropSection title={t('manualEntry.sectionTitle')}>
        <PropRow label={t('manualEntry.label')}>
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.label} onChange={(e) => onChange({ label: e.target.value })} />
        </PropRow>
        <PropRow label={t('manualEntry.labelPosition')}>
          <SelectInput value={el.labelPosition} onChange={(v) => onChange({ labelPosition: v as ManualEntryField['labelPosition'] })} options={[{ value: 'top', label: t('manualEntry.labelPosTop') }, { value: 'left', label: t('manualEntry.labelPosLeft') }, { value: 'none', label: t('manualEntry.labelPosNone') }]} />
        </PropRow>
        <PropRow label={t('manualEntry.displayMode')}>
          <SelectInput value={el.displayMode} onChange={(v) => onChange({ displayMode: v as ManualEntryField['displayMode'] })} options={[{ value: 'line', label: t('manualEntry.displayLine') }, { value: 'box', label: t('manualEntry.displayBox') }, { value: 'grid', label: t('manualEntry.displayGrid') }, { value: 'none', label: t('manualEntry.displayNone') }]} />
        </PropRow>
        {el.displayMode === 'grid' && (
          <PropRow label={t('manualEntry.gridCount')}><NumInput value={el.gridCount ?? 10} onChange={(v) => onChange({ gridCount: v })} min={1} max={50} /></PropRow>
        )}
        <PropRow label={t('manualEntry.lineColor')}><ColorInput value={el.lineColor} onChange={(v) => onChange({ lineColor: v })} /></PropRow>
        <PropRow label={t('manualEntry.placeholder')}>
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
        </PropRow>
      </PropSection>
      <PropSection title={t('manualEntry.furiganaSection')}>
        <PropRow label="">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              aria-label={t('manualEntry.furiganaToggle')}
              checked={el.furiganaEnabled ?? false}
              onChange={(e) => onChange({ furiganaEnabled: e.target.checked })}
            />
            {t('manualEntry.furiganaToggle')}
          </label>
        </PropRow>
        {el.furiganaEnabled && (
          <>
            <PropRow label={t('manualEntry.furiganaRatio')}>
              <NumInput value={el.furiganaRatio ?? 0.35} onChange={(v) => onChange({ furiganaRatio: v })} min={0.1} max={0.9} step={0.05} />
            </PropRow>
            <PropRow label={t('manualEntry.furiganaDataSource')}>
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs w-full bg-background"
                placeholder={t('manualEntry.furiganaDataSourcePlaceholder')}
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
