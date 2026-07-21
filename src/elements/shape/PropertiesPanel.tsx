import { useTranslation } from 'react-i18next'
import type { ShapeElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ShapeElement
  onChange: (patch: Partial<ShapeElement>) => void
}

export function ShapePropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('shape.title')}>
      <PropRow label={t('shape.shape')}>
        <SelectInput value={el.shape} onChange={(v) => onChange({ shape: v as ShapeElement['shape'] })} options={[{ value: 'rectangle', label: t('shape.rectangle') }, { value: 'circle', label: t('shape.circle') }, { value: 'line', label: t('shape.line') }]} />
      </PropRow>
      <PropRow label={t('shape.fillColor')}><ColorInput value={el.fill ?? '#ffffff'} onChange={(v) => onChange({ fill: v })} /></PropRow>
      <PropRow label={t('shape.strokeColor')}><ColorInput value={el.stroke ?? '#000000'} onChange={(v) => onChange({ stroke: v })} /></PropRow>
      <PropRow label={t('shape.strokeWidth')}><NumInput value={el.strokeWidth ?? 0.3} onChange={(v) => onChange({ strokeWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      <PropRow label={t('shape.strokeStyle')}>
        <SelectInput value={el.strokeDash ?? 'solid'} onChange={(v) => onChange({ strokeDash: v as ShapeElement['strokeDash'] })} options={[{ value: 'solid', label: t('shape.styleSolid') }, { value: 'dashed', label: t('shape.styleDashed') }, { value: 'dotted', label: t('shape.styleDotted') }]} />
      </PropRow>
      {el.shape === 'rectangle' && (
        <PropRow label={t('shape.radius')}><NumInput value={el.borderRadius ?? 0} onChange={(v) => onChange({ borderRadius: v })} min={0} step={0.5} unit="mm" /></PropRow>
      )}
    </PropSection>
  )
}
