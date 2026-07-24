/** ElementDef for `divider` — registered in src/elements/registry.ts (#414). */
import { SeparatorHorizontal } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { DividerElement } from '@/types'
import { DividerRenderer } from './Renderer'
import { DividerPropertiesPanel } from './PropertiesPanel'

export const dividerDef: ElementDef<DividerElement> = {
  type: 'divider',
  renderElement: ({ element }) => <DividerRenderer element={element} />,
  PropertiesPanel: DividerPropertiesPanel,
  layerIcon: SeparatorHorizontal,
  layerName: (_el, t) => t('sidebar.layerUtils.divider'),
  bindable: false,
}
