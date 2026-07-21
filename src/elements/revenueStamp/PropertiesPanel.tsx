import { useTranslation } from 'react-i18next'
import type { RevenueStampElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput } from '@/elements/_base/sharedUI'

interface Props {
  el: RevenueStampElement
  onChange: (patch: Partial<RevenueStampElement>) => void
}

export function RevenueStampPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('revenueStamp.title')}>
      <PropRow label={t('revenueStamp.amount')}>
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.amount ?? ''} placeholder={t('revenueStamp.amountPlaceholder')} onChange={(e) => onChange({ amount: e.target.value || undefined })} />
      </PropRow>
      <PropRow label={t('revenueStamp.borderColor')}><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
      <PropRow label={t('revenueStamp.borderWidth')}><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.showLabel} onChange={(e) => onChange({ showLabel: e.target.checked })} className="rounded" />
        {t('revenueStamp.showLabel')}
      </label>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.showCancellationGuide} onChange={(e) => onChange({ showCancellationGuide: e.target.checked })} className="rounded" />
        {t('revenueStamp.showCancellationGuide')}
      </label>
    </PropSection>
  )
}
