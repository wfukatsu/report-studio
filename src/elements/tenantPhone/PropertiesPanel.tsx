import { useShallow } from 'zustand/shallow'
import type { TenantPhoneElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props { el: TenantPhoneElement; onChange: (patch: Partial<TenantPhoneElement>) => void }

export function TenantPhonePropertiesPanel({ el, onChange }: Props) {
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title="電話番号">
        <PropRow label="未設定時テキスト">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder="（電話番号未設定）"
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
