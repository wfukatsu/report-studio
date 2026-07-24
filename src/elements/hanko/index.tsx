/** ElementDef for `hanko` — registered in src/elements/registry.ts (#414). */
import { Stamp } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { HankoElement } from '@/types'
import { HankoRenderer } from './Renderer'
import { HankoPropertiesPanel } from './PropertiesPanel'

export const hankoDef: ElementDef<HankoElement> = {
  type: 'hanko',
  renderElement: ({ element, data }) => <HankoRenderer element={element} data={data} />,
  PropertiesPanel: HankoPropertiesPanel,
  layerIcon: Stamp,
  layerName: (_el, t) => t('sidebar.layerUtils.hanko'),
  bindable: false,
}
