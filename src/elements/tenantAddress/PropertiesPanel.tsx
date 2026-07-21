import { useShallow } from 'zustand/shallow'
import { useTranslation } from 'react-i18next'
import type { TenantAddressElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props { el: TenantAddressElement; onChange: (patch: Partial<TenantAddressElement>) => void }

export function TenantAddressPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title={t('tenantAddress.title')}>
        <PropRow label={t('tenantAddress.displayMode')}>
          <SelectInput
            value={el.displayMode ?? 'single'}
            onChange={(v) => onChange({ displayMode: v as 'single' | 'multiLine' })}
            options={[
              { value: 'single', label: t('tenantAddress.single') },
              { value: 'multiLine', label: t('tenantAddress.multiLine') },
            ]}
          />
        </PropRow>
        <PropRow label={t('tenantAddress.fallbackLabel')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder={t('tenantAddress.fallbackPlaceholder')}
            onChange={(e) => onChange({ fallback: e.target.value || undefined })}
          />
        </PropRow>
      </PropSection>
      <TextStyleSection
        style={el.style}
        defaultStyle={defaultTextStyle}
        onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
      />
    </>
  )
}
