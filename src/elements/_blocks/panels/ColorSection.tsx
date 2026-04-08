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

export function ColorSection({ colors, onChange, title = '配色' }: ColorSectionProps) {
  return (
    <PropSection title={title}>
      {colors.map((c) => (
        <PropRow key={c.key} label={c.label}>
          <ColorInput value={c.value} onChange={(v) => onChange(c.key, v)} />
        </PropRow>
      ))}
    </PropSection>
  )
}
