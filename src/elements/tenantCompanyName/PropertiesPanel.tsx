import { useShallow } from 'zustand/shallow'
import { useTranslation } from 'react-i18next'
import type { TenantCompanyNameElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props {
  el: TenantCompanyNameElement
  onChange: (patch: Partial<TenantCompanyNameElement>) => void
}

export function TenantCompanyNamePropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title={t('tenantCompanyName.title')}>
        <PropRow label={t('tenantCompanyName.fallbackLabel')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder={t('tenantCompanyName.fallbackPlaceholder')}
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
