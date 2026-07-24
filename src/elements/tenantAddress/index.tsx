/** ElementDef for `tenantAddress` — registered in src/elements/registry.ts (#414). */
import { MapPin } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TenantAddressElement } from '@/types'
import { TenantAddressRenderer } from './Renderer'
import { TenantAddressPropertiesPanel } from './PropertiesPanel'

export const tenantAddressDef: ElementDef<TenantAddressElement> = {
  type: 'tenantAddress',
  renderElement: ({ element, readonly, defaultStyle }) => (
    <TenantAddressRenderer element={element} resolveValues={readonly} defaultStyle={defaultStyle} />
  ),
  PropertiesPanel: TenantAddressPropertiesPanel,
  layerIcon: MapPin,
  layerName: (_el, t) => t('sidebar.layerUtils.tenantAddress'),
  bindable: false,
}
