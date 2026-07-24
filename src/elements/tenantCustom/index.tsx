/** ElementDef for `tenantCustom` — registered in src/elements/registry.ts (#414). */
import { Minus } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TenantCustomElement } from '@/types'
import { TenantCustomRenderer } from './Renderer'
import { TenantCustomPropertiesPanel } from './PropertiesPanel'

export const tenantCustomDef: ElementDef<TenantCustomElement> = {
  type: 'tenantCustom',
  renderElement: ({ element, readonly, defaultStyle }) => (
    <TenantCustomRenderer element={element} resolveValues={readonly} defaultStyle={defaultStyle} />
  ),
  PropertiesPanel: TenantCustomPropertiesPanel,
  layerIcon: Minus,
  layerName: (el, t) => t('sidebar.layerUtils.tenantCustom', { field: el.fieldKey || t('sidebar.layerUtils.unset') }),
  bindable: false,
}
