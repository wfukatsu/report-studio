import { useTranslation } from 'react-i18next'
import { PropSection, PropRow, ColorInput } from '@/elements/_base/sharedUI'

interface ColorEntry {
  key: string
  label: string
  value: string
}

interface ColorSectionProps {
  colors: ColorEntry[]
  onChange: (key: string, value: string) => void
  title?: string
}

export function ColorSection({ colors, onChange, title }: ColorSectionProps) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={title ?? t('blocks.color.title')}>
      {colors.map((c) => (
        <PropRow key={c.key} label={c.label}>
          <ColorInput value={c.value} onChange={(v) => onChange(c.key, v)} />
        </PropRow>
      ))}
    </PropSection>
  )
}
