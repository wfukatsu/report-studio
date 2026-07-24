/** ElementDef for `formTable` — registered in src/elements/registry.ts (#414). */
import { TableProperties } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { FormTableElement } from '@/types'
import { FormTableRenderer } from './Renderer'
import { FormTablePropertiesPanel } from './PropertiesPanel'

export const formTableDef: ElementDef<FormTableElement> = {
  type: 'formTable',
  renderElement: ({ element, data, readonly }) => {
    // Editor mode: show design preview (placeholders). Preview mode: show live data.
    // Gated on `readonly` for parity with repeatingBand / repeatingList — otherwise a
    // data-bound table would render live rows in the design canvas while the other two
    // repeating containers show placeholders.
    const records = readonly && element.dataSource
      ? (data[element.dataSource] as Record<string, unknown>[] | undefined)
      : undefined
    return <FormTableRenderer element={element} records={records} />
  },
  PropertiesPanel: FormTablePropertiesPanel,
  layerIcon: TableProperties,
  layerName: (_el, t) => t('sidebar.layerUtils.formTable'),
  bindable: false,
}
