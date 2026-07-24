/** ElementDef for `manualEntry` — registered in src/elements/registry.ts (#414). */
import { PenLine } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { ManualEntryField } from '@/types'
import { ManualEntryRenderer } from './Renderer'
import { ManualEntryPropertiesPanel } from './PropertiesPanel'

export const manualEntryDef: ElementDef<ManualEntryField> = {
  type: 'manualEntry',
  renderElement: ({ element, data }) => <ManualEntryRenderer element={element} data={data} />,
  PropertiesPanel: ManualEntryPropertiesPanel,
  layerIcon: PenLine,
  layerName: (_el, t) => t('sidebar.layerUtils.manualEntry'),
  bindable: false,
}
