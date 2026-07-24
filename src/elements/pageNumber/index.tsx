/** ElementDef for `pageNumber` — registered in src/elements/registry.ts (#414). */
import { Hash } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { PageNumberElement } from '@/types'
import { PageNumberRenderer } from './Renderer'
import { PageNumberPropertiesPanel } from './PropertiesPanel'

export const pageNumberDef: ElementDef<PageNumberElement> = {
  type: 'pageNumber',
  renderElement: ({ element, readonly, pageIndex, totalPages }) => (
    <PageNumberRenderer element={element} resolveValues={readonly} pageIndex={pageIndex} totalPages={totalPages} />
  ),
  PropertiesPanel: PageNumberPropertiesPanel,
  layerIcon: Hash,
  layerName: (_el, t) => t('sidebar.layerUtils.pageNumber'),
  bindable: false,
}
