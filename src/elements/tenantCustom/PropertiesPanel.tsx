import { useShallow } from 'zustand/shallow'
import { useTranslation } from 'react-i18next'
import type { TenantCustomElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props {
  el: TenantCustomElement
  onChange: (patch: Partial<TenantCustomElement>) => void
}

export function TenantCustomPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title={t('tenantCustom.title')}>
        <PropRow label={t('tenantCustom.fieldKey')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.fieldKey}
            placeholder={t('tenantCustom.fieldKeyPlaceholder')}
            onChange={(e) => onChange({ fieldKey: e.target.value })}
          />
        </PropRow>
        <div className="text-[10px] text-muted-foreground">
          {t('tenantCustom.hint')}
        </div>
        <PropRow label={t('tenantCustom.fallbackLabel')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder={t('tenantCustom.fallbackPlaceholder')}
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
