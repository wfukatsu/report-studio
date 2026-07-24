/** ElementDef for `checkbox` — registered in src/elements/registry.ts (#414). */
import { SquareCheck } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { CheckboxElement } from '@/types'
import { CheckboxRenderer } from './Renderer'
import { CheckboxPropertiesPanel } from './PropertiesPanel'

export const checkboxDef: ElementDef<CheckboxElement> = {
  type: 'checkbox',
  renderElement: ({ element, data }) => <CheckboxRenderer element={element} data={data} />,
  PropertiesPanel: CheckboxPropertiesPanel,
  layerIcon: SquareCheck,
  layerName: (_el, t) => t('sidebar.layerUtils.checkbox'),
  bindable: true,
}
