/** ElementDef for `repeatingList` — registered in src/elements/registry.ts (#414). */
import { LayoutGrid } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { RepeatingListElement } from '@/types'
import { RepeatingListRenderer } from './Renderer'
import { RepeatingListPropertiesPanel } from './PropertiesPanel'

export const repeatingListDef: ElementDef<RepeatingListElement> = {
  type: 'repeatingList',
  renderElement: ({ element, data, readonly }) => {
    const records = readonly && element.dataSource
      ? (data[element.dataSource] as Record<string, unknown>[] | undefined)
      : undefined
    return <RepeatingListRenderer element={element} records={records} />
  },
  PropertiesPanel: RepeatingListPropertiesPanel,
  layerIcon: LayoutGrid,
  layerName: (_el, t) => t('sidebar.layerUtils.repeatingList'),
  bindable: false,
}
