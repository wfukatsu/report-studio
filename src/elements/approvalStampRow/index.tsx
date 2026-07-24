/** ElementDef for `approvalStampRow` — registered in src/elements/registry.ts (#414). */
import { Rows3 } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { ApprovalStampRowElement } from '@/types'
import { ApprovalStampRowRenderer } from './Renderer'
import { ApprovalStampRowPropertiesPanel } from './PropertiesPanel'

export const approvalStampRowDef: ElementDef<ApprovalStampRowElement> = {
  type: 'approvalStampRow',
  renderElement: ({ element }) => <ApprovalStampRowRenderer element={element} />,
  PropertiesPanel: ApprovalStampRowPropertiesPanel,
  layerIcon: Rows3,
  layerName: (_el, t) => t('sidebar.layerUtils.approvalStampRow'),
  bindable: false,
}
