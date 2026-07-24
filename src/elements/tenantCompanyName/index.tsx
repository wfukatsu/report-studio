/** ElementDef for `tenantCompanyName` — registered in src/elements/registry.ts (#414). */
import { Building2 } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TenantCompanyNameElement } from '@/types'
import { TenantCompanyNameRenderer } from './Renderer'
import { TenantCompanyNamePropertiesPanel } from './PropertiesPanel'

export const tenantCompanyNameDef: ElementDef<TenantCompanyNameElement> = {
  type: 'tenantCompanyName',
  renderElement: ({ element, readonly, defaultStyle }) => (
    <TenantCompanyNameRenderer element={element} resolveValues={readonly} defaultStyle={defaultStyle} />
  ),
  PropertiesPanel: TenantCompanyNamePropertiesPanel,
  layerIcon: Building2,
  layerName: (_el, t) => t('sidebar.layerUtils.tenantCompanyName'),
  bindable: false,
}
