/** ElementDef for `eraSelect` — registered in src/elements/registry.ts (#414). */
import { Calendar } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { EraSelectElement } from '@/types'
import { EraSelectRenderer } from './Renderer'
import { EraSelectPropertiesPanel } from './PropertiesPanel'

export const eraSelectDef: ElementDef<EraSelectElement> = {
  type: 'eraSelect',
  renderElement: ({ element, data }) => <EraSelectRenderer element={element} data={data} />,
  PropertiesPanel: EraSelectPropertiesPanel,
  layerIcon: Calendar,
  layerName: (_el, t) => t('sidebar.layerUtils.eraSelect'),
  bindable: true,
}
