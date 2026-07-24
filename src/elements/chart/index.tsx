/** ElementDef for `chart` — registered in src/elements/registry.ts (#414). */
import { BarChart2 } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { ChartElement } from '@/types'
import { ChartRenderer } from './Renderer'
import { ChartPropertiesPanel } from './PropertiesPanel'

export const chartDef: ElementDef<ChartElement> = {
  type: 'chart',
  renderElement: ({ element, data, readonly }) => (
    <ChartRenderer element={element} data={data} sampleHint={!readonly} />
  ),
  PropertiesPanel: ChartPropertiesPanel,
  layerIcon: BarChart2,
  layerName: (_el, t) => t('sidebar.layerUtils.chart'),
  bindable: false,
  isEmptyInPreview: (el, data) => {
    // If no dataBinding configured, ChartRenderer falls back to SAMPLE_DATA — show it
    if (!el.dataBinding) return false
    const items = data[el.dataBinding]
    return !Array.isArray(items) || items.length === 0
  },
}
