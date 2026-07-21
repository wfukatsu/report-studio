import { useTranslation } from 'react-i18next'
import type { BarcodeElement } from '@/types'
import { PropSection, PropRow, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: BarcodeElement
  onChange: (patch: Partial<BarcodeElement>) => void
}

export function BarcodePropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('barcode.title')}>
      <PropRow label={t('barcode.kind')}>
        <SelectInput value={el.kind} onChange={(v) => onChange({ kind: v as BarcodeElement['kind'] })} options={[{ value: 'qr', label: t('barcode.kindQr') }, { value: 'code128', label: 'CODE128' }, { value: 'code39', label: 'CODE39' }, { value: 'jan13', label: 'JAN13 (EAN-13)' }]} />
      </PropRow>
      <PropRow label={t('barcode.value')}>
        <FieldKeyInput value={el.value} onChange={(v) => onChange({ value: v })} placeholder={t('barcode.valuePlaceholder', { token: '{{fieldKey}}' })} />
      </PropRow>
      {el.kind === 'qr' && (
        <PropRow label={t('barcode.errorCorrection')}>
          <SelectInput value={el.errorCorrection ?? 'M'} onChange={(v) => onChange({ errorCorrection: v as BarcodeElement['errorCorrection'] })} options={[{ value: 'L', label: t('barcode.ecL') }, { value: 'M', label: t('barcode.ecM') }, { value: 'Q', label: t('barcode.ecQ') }, { value: 'H', label: t('barcode.ecH') }]} />
        </PropRow>
      )}
      <PropRow label={t('barcode.darkColor')}><ColorInput value={el.darkColor ?? '#000000'} onChange={(v) => onChange({ darkColor: v })} /></PropRow>
      <PropRow label={t('barcode.lightColor')}><ColorInput value={el.lightColor ?? '#ffffff'} onChange={(v) => onChange({ lightColor: v })} /></PropRow>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={el.showText ?? true} onChange={(e) => onChange({ showText: e.target.checked })} className="rounded" />
        {t('barcode.showText')}
      </label>
    </PropSection>
  )
}
