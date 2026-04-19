import { useShallow } from 'zustand/shallow'
import type { TenantCustomElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props {
  el: TenantCustomElement
  onChange: (patch: Partial<TenantCustomElement>) => void
}

export function TenantCustomPropertiesPanel({ el, onChange }: Props) {
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title="カスタムフィールド">
        <PropRow label="フィールドキー">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.fieldKey}
            placeholder="例: taxRegistrationNumber"
            onChange={(e) => onChange({ fieldKey: e.target.value })}
          />
        </PropRow>
        <div className="text-[10px] text-muted-foreground">
          テナント情報のカスタムフィールドキーを入力してください。
        </div>
        <PropRow label="未設定時テキスト">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder="（未設定）"
            onChange={(e) => onChange({ fallback: e.target.value || undefined })}
          />
        </PropRow>
      </PropSection>
      <TextStyleSection
        style={el.style}
        defaultStyle={defaultTextStyle}
        onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
      />
    </>
  )
}
