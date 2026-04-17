<<<<<<< HEAD
import { useShallow } from 'zustand/shallow'
import type { TextElement, TextStyle } from '@/types'
import { useReportStore } from '@/store'
=======
import type { TextElement } from '@/types'
>>>>>>> feat/formtable-excel-editing
import { PropSection } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'
import { TokenInput } from '@/components/common/TokenInput'

interface Props {
  el: TextElement
  onChange: (patch: Partial<TextElement>) => void
}

export function TextPropertiesPanel({ el, onChange }: Props) {
<<<<<<< HEAD
  // Subscribe once here — the PropertiesPanel renders for only the selected element,
  // so this is a single subscription regardless of how many text elements are on canvas.
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

=======
>>>>>>> feat/formtable-excel-editing
  return (
    <>
      <TextStyleSection
        style={el.style}
<<<<<<< HEAD
        defaultStyle={defaultTextStyle}
=======
>>>>>>> feat/formtable-excel-editing
        onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
        showFurigana
        furigana={el.furigana}
        onFuriganaChange={(v) => onChange({ furigana: v })}
      />
      <PropSection title="コンテンツ">
        <TokenInput
          value={el.content}
          onChange={(v) => onChange({ content: v })}
          rows={4}
          placeholder={'テキスト内容（{{フィールドキー}} でデータ参照）'}
        />
      </PropSection>
    </>
  )
}
