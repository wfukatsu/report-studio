/** ElementDef for `currentDate` — registered in src/elements/registry.ts (#414). */
import { CalendarDays } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { CurrentDateElement } from '@/types'
import { CurrentDateRenderer } from './Renderer'
import { CurrentDatePropertiesPanel } from './PropertiesPanel'

export const currentDateDef: ElementDef<CurrentDateElement> = {
  type: 'currentDate',
  renderElement: ({ element, readonly }) => <CurrentDateRenderer element={element} resolveValues={readonly} />,
  PropertiesPanel: CurrentDatePropertiesPanel,
  layerIcon: CalendarDays,
  layerName: (_el, t) => t('sidebar.layerUtils.currentDate'),
  bindable: false,
}
