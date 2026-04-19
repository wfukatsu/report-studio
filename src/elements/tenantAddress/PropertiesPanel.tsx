import { useShallow } from 'zustand/shallow'
import type { TenantAddressElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props { el: TenantAddressElement; onChange: (patch: Partial<TenantAddressElement>) => void }

export function TenantAddressPropertiesPanel({ el, onChange }: Props) {
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title="住所">
        <PropRow label="表示モード">
          <SelectInput
            value={el.displayMode ?? 'single'}
            onChange={(v) => onChange({ displayMode: v as 'single' | 'multiLine' })}
            options={[
              { value: 'single', label: '1行表示' },
              { value: 'multiLine', label: '3行表示' },
            ]}
          />
        </PropRow>
        <PropRow label="未設定時テキスト">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder="（住所未設定）"
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
