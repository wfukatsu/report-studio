/** ElementDef for `revenueStamp` — registered in src/elements/registry.ts (#414). */
import { Ticket } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { RevenueStampElement } from '@/types'
import { RevenueStampRenderer } from './Renderer'
import { RevenueStampPropertiesPanel } from './PropertiesPanel'

export const revenueStampDef: ElementDef<RevenueStampElement> = {
  type: 'revenueStamp',
  renderElement: ({ element }) => <RevenueStampRenderer element={element} />,
  PropertiesPanel: RevenueStampPropertiesPanel,
  layerIcon: Ticket,
  layerName: (_el, t) => t('sidebar.layerUtils.revenueStamp'),
  bindable: false,
}
