import { useTranslation } from 'react-i18next'
import type { CheckboxElement, CheckmarkStyle, CheckboxLabelPosition } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: CheckboxElement
  onChange: (patch: Partial<CheckboxElement>) => void
}

export function CheckboxPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('checkbox.sectionTitle')}>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={el.checked}
          onChange={(e) => onChange({ checked: e.target.checked })}
          className="rounded"
        />
        {t('checkbox.checkedPreview')}
      </label>
      <PropRow label={t('checkbox.checkmarkSymbol')}>
        <SelectInput
          value={el.checkmark}
          onChange={(v) => onChange({ checkmark: v as CheckmarkStyle })}
          options={[
            { value: '✓', label: t('checkbox.checkmarkCheck') },
            { value: '×', label: t('checkbox.checkmarkCross') },
            { value: '●', label: t('checkbox.checkmarkCircle') },
          ]}
        />
      </PropRow>
      <PropRow label={t('checkbox.label')}>
        <input
          type="text"
          className="border rounded px-2 py-1 text-xs w-full bg-background"
          value={el.label}
          placeholder={t('checkbox.labelPlaceholder')}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </PropRow>
      <PropRow label={t('checkbox.labelPosition')}>
        <SelectInput
          value={el.labelPosition ?? 'right'}
          onChange={(v) => onChange({ labelPosition: v as CheckboxLabelPosition })}
          options={[
            { value: 'right', label: t('checkbox.labelPosRight') },
            { value: 'left', label: t('checkbox.labelPosLeft') },
            { value: 'top', label: t('checkbox.labelPosTop') },
            { value: 'bottom', label: t('checkbox.labelPosBottom') },
          ]}
        />
      </PropRow>
      <PropRow label={t('checkbox.dataBind')}>
        <input
          type="text"
          className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
          value={el.dataSource ?? ''}
          placeholder={t('checkbox.dataBindPlaceholder')}
          onChange={(e) => onChange({ dataSource: e.target.value || undefined })}
        />
      </PropRow>
    </PropSection>
  )
}
