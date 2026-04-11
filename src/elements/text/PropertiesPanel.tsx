import type { TextElement } from '@/types'
import { PropSection } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'
import { TokenInput } from '@/components/common/TokenInput'

interface Props {
  el: TextElement
  onChange: (patch: Partial<TextElement>) => void
}

export function TextPropertiesPanel({ el, onChange }: Props) {
  return (
    <>
      <TextStyleSection
        style={el.style}
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
