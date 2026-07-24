/** ElementDef for `tenantPhone` — registered in src/elements/registry.ts (#414). */
import { Phone } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TenantPhoneElement } from '@/types'
import { TenantPhoneRenderer } from './Renderer'
import { TenantPhonePropertiesPanel } from './PropertiesPanel'

export const tenantPhoneDef: ElementDef<TenantPhoneElement> = {
  type: 'tenantPhone',
  renderElement: ({ element, readonly, defaultStyle }) => (
    <TenantPhoneRenderer element={element} resolveValues={readonly} defaultStyle={defaultStyle} />
  ),
  PropertiesPanel: TenantPhonePropertiesPanel,
  layerIcon: Phone,
  layerName: (_el, t) => t('sidebar.layerUtils.tenantPhone'),
  bindable: false,
}
