import { useTranslation } from 'react-i18next'
import type { TenantLogoElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: TenantLogoElement
  onChange: (patch: Partial<TenantLogoElement>) => void
}

export function TenantLogoPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('tenantLogo.title')}>
      <div className="text-[10px] text-muted-foreground mb-2">
        {t('tenantLogo.hint')}
      </div>
      <PropRow label={t('tenantLogo.fit')}>
        <SelectInput
          value={el.objectFit}
          onChange={(v) => onChange({ objectFit: v as TenantLogoElement['objectFit'] })}
          options={[
            { value: 'contain', label: t('tenantLogo.fitContain') },
            { value: 'cover',   label: t('tenantLogo.fitCover') },
            { value: 'fill',    label: t('tenantLogo.fitFill') },
            { value: 'none',    label: t('tenantLogo.fitNone') },
          ]}
        />
      </PropRow>
      <PropRow label={t('tenantLogo.opacity')}>
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={1} step={0.05}
            className="flex-1"
            value={el.opacity ?? 1}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          />
          <span className="text-xs text-muted-foreground w-8 text-right">
            {Math.round((el.opacity ?? 1) * 100)}%
          </span>
        </div>
      </PropRow>
    </PropSection>
  )
}
