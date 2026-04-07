import type { EraSelectElement } from '@/types'
import { PropSection, PropRow } from '@/elements/_base/sharedUI'

interface Props {
  el: EraSelectElement
  onChange: (patch: Partial<EraSelectElement>) => void
}

export function EraSelectPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="元号選択">
      <PropRow label="データバインド">
        <input
          type="text"
          className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
          value={el.dataSource ?? ''}
          placeholder="例: employee.era"
          onChange={(e) => onChange({ dataSource: e.target.value || undefined })}
        />
      </PropRow>
    </PropSection>
  )
}
