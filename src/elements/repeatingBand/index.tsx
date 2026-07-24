/** ElementDef for `repeatingBand` — registered in src/elements/registry.ts (#414). */
import { AlignJustify } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { RepeatingBandElement } from '@/types'
import { RepeatingBandRenderer } from './Renderer'
import { RepeatingBandPropertiesPanel } from './PropertiesPanel'

export const repeatingBandDef: ElementDef<RepeatingBandElement> = {
  type: 'repeatingBand',
  renderElement: ({ element, data, readonly, onBandFieldsChange }) => {
    // Editor mode: show design preview (placeholders). Preview mode: show live data.
    const records = readonly && element.dataSource
      ? (data[element.dataSource] as Record<string, unknown>[] | undefined)
      : undefined
    return (
      <RepeatingBandRenderer
        element={element}
        records={records}
        onFieldsChange={readonly ? undefined : onBandFieldsChange}
      />
    )
  },
  PropertiesPanel: RepeatingBandPropertiesPanel,
  layerIcon: AlignJustify,
  layerName: (_el, t) => t('sidebar.layerUtils.repeatingBand'),
  bindable: false,
  isEmptyInPreview: (el, data) => {
    // If no dataSource configured, treat as static (no binding)
    if (!el.dataSource) return false
    const items = data[el.dataSource]
    return !Array.isArray(items) || items.length === 0
  },
}
