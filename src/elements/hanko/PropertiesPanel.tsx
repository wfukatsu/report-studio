import { useTranslation } from 'react-i18next'
import type { HankoElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: HankoElement
  onChange: (patch: Partial<HankoElement>) => void
}

export function HankoPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('hanko.title')}>
      <PropRow label={t('hanko.text')}>
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.text} onChange={(e) => onChange({ text: e.target.value })} />
      </PropRow>
      <PropRow label={t('hanko.shape')}>
        <SelectInput value={el.shape} onChange={(v) => onChange({ shape: v as HankoElement['shape'] })} options={[{ value: 'circle', label: t('hanko.shapeCircle') }, { value: 'rectangle', label: t('hanko.shapeRectangle') }]} />
      </PropRow>
      <PropRow label={t('hanko.writingMode')}>
        <SelectInput value={el.writingMode} onChange={(v) => onChange({ writingMode: v as HankoElement['writingMode'] })} options={[{ value: 'vertical-rl', label: t('hanko.vertical') }, { value: 'horizontal-tb', label: t('hanko.horizontal') }]} />
      </PropRow>
      <PropRow label={t('hanko.borderColor')}><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
      <PropRow label={t('hanko.textColor')}><ColorInput value={el.textColor} onChange={(v) => onChange({ textColor: v })} /></PropRow>
      <PropRow label={t('hanko.fontSize')}><NumInput value={el.fontSize} onChange={(v) => onChange({ fontSize: v })} min={1} unit="mm" /></PropRow>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.doubleBorder} onChange={(e) => onChange({ doubleBorder: e.target.checked })} className="rounded" />
        {t('hanko.doubleBorder')}
      </label>
      <PropRow label={t('hanko.dataBinding')}>
        <FieldKeyInput value={el.binding ?? ''} onChange={(v) => onChange({ binding: v || undefined })} placeholder={t('hanko.bindingPlaceholder')} />
      </PropRow>
    </PropSection>
  )
}
