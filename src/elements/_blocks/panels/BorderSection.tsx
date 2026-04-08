import type { BorderConfig } from '../renderers/ElementFrame'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { DEFAULT_BORDER_WIDTH } from '../constants'

const STROKE_STYLE_OPTIONS = [
  { value: 'solid', label: '実線' },
  { value: 'dashed', label: '破線' },
  { value: 'dotted', label: '点線' },
]

interface BorderSectionProps {
  border: BorderConfig
  onChange: (patch: Partial<BorderConfig>) => void
  /** Show border radius input (default: false) */
  showRadius?: boolean
}

export function BorderSection({ border, onChange, showRadius = false }: BorderSectionProps) {
  return (
    <PropSection title="ボーダー">
      <PropRow label="色">
        <ColorInput value={border.color} onChange={(v) => onChange({ color: v })} />
      </PropRow>
      <PropRow label="幅">
        <NumInput
          value={border.width ?? DEFAULT_BORDER_WIDTH}
          onChange={(v) => onChange({ width: v })}
          min={0}
          max={5}
          step={0.1}
          unit="mm"
        />
      </PropRow>
      <PropRow label="スタイル">
        <SelectInput
          value={border.style ?? 'solid'}
          onChange={(v) => onChange({ style: v as BorderConfig['style'] })}
          options={STROKE_STYLE_OPTIONS}
        />
      </PropRow>
      {showRadius && (
        <PropRow label="角丸">
          <NumInput
            value={border.radius ?? 0}
            onChange={(v) => onChange({ radius: v })}
            min={0}
            max={20}
            step={0.5}
            unit="mm"
          />
        </PropRow>
      )}
    </PropSection>
  )
}
