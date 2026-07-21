import { useShallow } from 'zustand/shallow'
import { useTranslation } from 'react-i18next'
import type { TextElement, TextStyle } from '@/types'
import { useReportStore } from '@/store'
import { PropSection } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'
import { TokenInput } from '@/components/common/TokenInput'

interface Props {
  el: TextElement
  onChange: (patch: Partial<TextElement>) => void
}

export function TextPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  // Subscribe once here — the PropertiesPanel renders for only the selected element,
  // so this is a single subscription regardless of how many text elements are on canvas.
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <TextStyleSection
        style={el.style}
        defaultStyle={defaultTextStyle}
        onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
        showFurigana
        furigana={el.furigana}
        onFuriganaChange={(v) => onChange({ furigana: v })}
      />
      <PropSection title={t('text.contentTitle')}>
        <TokenInput
          value={el.content}
          onChange={(v) => onChange({ content: v })}
          rows={4}
          placeholder={t('text.contentPlaceholder', { token: '{{フィールドキー}}' })}
        />
      </PropSection>
    </>
  )
}
