import { useTranslation } from 'react-i18next'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface DataBindingSectionProps {
  fieldKey: string
  onChange: (fieldKey: string) => void
  /** Section title override */
  title?: string
  /** Field label override */
  label?: string
}

export function DataBindingSection({
  fieldKey,
  onChange,
  title,
  label,
}: DataBindingSectionProps) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={title ?? t('blocks.dataBinding.title')}>
      <PropRow label={label ?? t('blocks.dataBinding.fieldKey')}>
        <FieldKeyInput value={fieldKey} onChange={onChange} />
      </PropRow>
    </PropSection>
  )
}
