import { useShallow } from 'zustand/shallow'
import type { DataFieldElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'
import { DataBindingSection } from '@/elements/_blocks/panels/DataBindingSection'
import { FormatSection } from '@/elements/_blocks/panels/FormatSection'

interface Props {
  el: DataFieldElement
  onChange: (patch: Partial<DataFieldElement>) => void
}

export function DataFieldPropertiesPanel({ el, onChange }: Props) {
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <DataBindingSection
        fieldKey={el.fieldKey}
        onChange={(v) => onChange({ fieldKey: v })}
      />
      <PropSection title="表示設定">
        <PropRow label="プレースホルダー">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.label ?? ''}
            placeholder="未入力時のラベル"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </PropRow>
        <PropRow label="フォールバックテキスト">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallbackText ?? ''}
            placeholder="データなし時に表示するテキスト"
            onChange={(e) => onChange({ fallbackText: e.target.value })}
          />
        </PropRow>
      </PropSection>
      <FormatSection
        format={el.format}
        onChange={(f) => onChange({ format: f })}
      />
      <TextStyleSection
        style={el.style}
        defaultStyle={defaultTextStyle}
        onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
      />
    </>
  )
}
