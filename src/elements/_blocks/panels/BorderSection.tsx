import { useTranslation } from 'react-i18next'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { DEFAULT_BORDER_WIDTH } from '../constants'

// ---------------------------------------------------------------------------
// Shared border / padding types (previously in ElementFrame.tsx)
// ---------------------------------------------------------------------------

export interface BorderConfig {
  color: string
  width: number
  style?: 'solid' | 'dashed' | 'dotted'
  radius?: number
}

export interface PaddingConfig {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

interface BorderSectionProps {
  border: BorderConfig
  onChange: (patch: Partial<BorderConfig>) => void
  /** Show border radius input (default: false) */
  showRadius?: boolean
}

export function BorderSection({ border, onChange, showRadius = false }: BorderSectionProps) {
  const { t } = useTranslation('elements')
  const strokeStyleOptions = [
    { value: 'solid', label: t('blocks.border.styleSolid') },
    { value: 'dashed', label: t('blocks.border.styleDashed') },
    { value: 'dotted', label: t('blocks.border.styleDotted') },
  ]
  return (
    <PropSection title={t('blocks.border.title')}>
      <PropRow label={t('blocks.border.color')}>
        <ColorInput value={border.color} onChange={(v) => onChange({ color: v })} />
      </PropRow>
      <PropRow label={t('blocks.border.width')}>
        <NumInput
          value={border.width ?? DEFAULT_BORDER_WIDTH}
          onChange={(v) => onChange({ width: v })}
          min={0}
          max={5}
          step={0.1}
          unit="mm"
        />
      </PropRow>
      <PropRow label={t('blocks.border.style')}>
        <SelectInput
          value={border.style ?? 'solid'}
          onChange={(v) => onChange({ style: v as BorderConfig['style'] })}
          options={strokeStyleOptions}
        />
      </PropRow>
      {showRadius && (
        <PropRow label={t('blocks.border.radius')}>
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
