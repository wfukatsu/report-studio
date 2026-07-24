/** ElementDef for `image` — registered in src/elements/registry.ts (#414). */
import { Image } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { ImageElement } from '@/types'
import { ImageRenderer } from './Renderer'
import { ImagePropertiesPanel } from './PropertiesPanel'

export const imageDef: ElementDef<ImageElement> = {
  type: 'image',
  renderElement: ({ element }) => <ImageRenderer element={element} />,
  PropertiesPanel: ImagePropertiesPanel,
  layerIcon: Image,
  layerName: (_el, t) => t('sidebar.layerUtils.image'),
  bindable: false,
}
