/** ElementDef for `barcode` — registered in src/elements/registry.ts (#414). */
import { QrCode } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { BarcodeElement } from '@/types'
import { BarcodeRenderer } from './Renderer'
import { BarcodePropertiesPanel } from './PropertiesPanel'

export const barcodeDef: ElementDef<BarcodeElement> = {
  type: 'barcode',
  renderElement: ({ element, data }) => <BarcodeRenderer element={element} data={data} />,
  PropertiesPanel: BarcodePropertiesPanel,
  layerIcon: QrCode,
  layerName: (_el, t) => t('sidebar.layerUtils.barcode'),
  bindable: false,
}
