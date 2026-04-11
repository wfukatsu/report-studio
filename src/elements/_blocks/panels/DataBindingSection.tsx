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
  title = 'データバインディング',
  label = 'フィールドキー',
}: DataBindingSectionProps) {
  return (
    <PropSection title={title}>
      <PropRow label={label}>
        <FieldKeyInput value={fieldKey} onChange={onChange} />
      </PropRow>
    </PropSection>
  )
}
