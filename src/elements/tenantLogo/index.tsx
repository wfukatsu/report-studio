/** ElementDef for `tenantLogo` — registered in src/elements/registry.ts (#414). */
import { Image } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TenantLogoElement } from '@/types'
import { TenantLogoRenderer } from './Renderer'
import { TenantLogoPropertiesPanel } from './PropertiesPanel'

export const tenantLogoDef: ElementDef<TenantLogoElement> = {
  type: 'tenantLogo',
  renderElement: ({ element }) => <TenantLogoRenderer element={element} />,
  PropertiesPanel: TenantLogoPropertiesPanel,
  layerIcon: Image,
  layerName: (_el, t) => t('sidebar.layerUtils.tenantLogo'),
  bindable: false,
}
