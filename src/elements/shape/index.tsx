/** ElementDef for `shape` — registered in src/elements/registry.ts (#414). */
import { Square } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { ShapeElement } from '@/types'
import { ShapeRenderer } from './Renderer'
import { ShapePropertiesPanel } from './PropertiesPanel'

export const shapeDef: ElementDef<ShapeElement> = {
  type: 'shape',
  renderElement: ({ element }) => <ShapeRenderer element={element} />,
  PropertiesPanel: ShapePropertiesPanel,
  layerIcon: Square,
  layerName: (el, t) => {
    if (el.shape === 'circle') return t('sidebar.layerUtils.shapeCircle')
    if (el.shape === 'line') return t('sidebar.layerUtils.shapeLine')
    return t('sidebar.layerUtils.shapeRect')
  },
  bindable: false,
}
