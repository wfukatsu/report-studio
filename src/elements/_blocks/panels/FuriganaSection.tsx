import { useTranslation } from 'react-i18next'
import { PropSection, PropRow, NumInput } from '@/elements/_base/sharedUI'
import { DEFAULT_FURIGANA_SCALE } from '../constants'

interface FuriganaSectionProps {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  ratio?: number
  onRatioChange?: (ratio: number) => void
  dataSource?: string
  onDataSourceChange?: (dataSource: string) => void
}

export function FuriganaSection({
  enabled,
  onEnabledChange,
  ratio,
  onRatioChange,
  dataSource,
  onDataSourceChange,
}: FuriganaSectionProps) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('blocks.furigana.title')}>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <span className="text-xs">{t('blocks.furigana.show')}</span>
      </label>

      {enabled && (
        <>
          {onRatioChange && (
            <PropRow label={t('blocks.furigana.heightRatio')}>
              <NumInput
                value={ratio ?? DEFAULT_FURIGANA_SCALE}
                onChange={onRatioChange}
                min={0.1}
                max={0.9}
                step={0.05}
              />
            </PropRow>
          )}

          {onDataSourceChange && (
            <PropRow label={t('blocks.furigana.dataSource')}>
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs w-full bg-background"
                value={dataSource ?? ''}
                placeholder={t('blocks.furigana.fieldKeyPlaceholder')}
                onChange={(e) => onDataSourceChange(e.target.value)}
              />
            </PropRow>
          )}
        </>
      )}
    </PropSection>
  )
}
