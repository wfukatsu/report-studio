/** ElementDef for `tenantRepresentative` — registered in src/elements/registry.ts (#414). */
import { User } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TenantRepresentativeElement } from '@/types'
import { TenantRepresentativeRenderer } from './Renderer'
import { TenantRepresentativePropertiesPanel } from './PropertiesPanel'

export const tenantRepresentativeDef: ElementDef<TenantRepresentativeElement> = {
  type: 'tenantRepresentative',
  renderElement: ({ element, readonly, defaultStyle }) => (
    <TenantRepresentativeRenderer element={element} resolveValues={readonly} defaultStyle={defaultStyle} />
  ),
  PropertiesPanel: TenantRepresentativePropertiesPanel,
  layerIcon: User,
  layerName: (_el, t) => t('sidebar.layerUtils.tenantRepresentative'),
  bindable: false,
}
