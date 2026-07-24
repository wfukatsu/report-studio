/** ElementDef for `dataField` — registered in src/elements/registry.ts (#414). */
import { Database } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { DataFieldElement } from '@/types'
import { resolveField } from '@/lib/dataBinding'
import { DataFieldRenderer } from './Renderer'
import { DataFieldPropertiesPanel } from './PropertiesPanel'

export const dataFieldDef: ElementDef<DataFieldElement> = {
  type: 'dataField',
  renderElement: ({ element, data, readonly, defaultStyle }) => (
    <DataFieldRenderer element={element} data={data} defaultStyle={defaultStyle} sampleHint={!readonly} />
  ),
  PropertiesPanel: DataFieldPropertiesPanel,
  layerIcon: Database,
  layerName: (_el, t) => t('sidebar.layerUtils.dataField'),
  bindable: true,
  isEmptyInPreview: (el, data, calculationOutputKeys) => {
    // Never hide calculated fields — their value may not have arrived yet
    // (async evaluation via useEvaluator) but they will resolve eventually.
    if (calculationOutputKeys?.has(el.fieldKey)) return false
    // Never hide fields that have fallbackText — the renderer will show it
    // when the bound data is empty (e.g. sample data not configured).
    if (el.fallbackText) return false
    // resolveField() returns '' for missing / null / undefined keys
    return resolveField(data, el.fieldKey) === ''
  },
}
