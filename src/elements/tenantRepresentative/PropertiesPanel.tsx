import { useShallow } from 'zustand/shallow'
import type { TenantRepresentativeElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

interface Props { el: TenantRepresentativeElement; onChange: (patch: Partial<TenantRepresentativeElement>) => void }

export function TenantRepresentativePropertiesPanel({ el, onChange }: Props) {
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))

  return (
    <>
      <PropSection title="代表者名">
        <PropRow label="未設定時テキスト">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder="（代表者名未設定）"
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
