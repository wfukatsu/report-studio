/** ElementDef for `text` — registered in src/elements/registry.ts (#414). */
import { Type } from 'lucide-react'
import type { ElementDef } from '@/elements/elementDef'
import type { TextElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'
import { TextRenderer } from './Renderer'
import { TextPropertiesPanel } from './PropertiesPanel'

/** Regex to detect unresolved {{...}} template tokens. */
const HAS_TEMPLATE = /\{\{[^}]+\}\}/

export const textDef: ElementDef<TextElement> = {
  type: 'text',
  renderElement: ({ element, data, readonly, defaultStyle }) => (
    <TextRenderer element={element} data={data} defaultStyle={defaultStyle} sampleHint={!readonly} />
  ),
  PropertiesPanel: TextPropertiesPanel,
  layerIcon: Type,
  layerName: (_el, t) => t('sidebar.layerUtils.text'),
  bindable: true,
  isEmptyInPreview: (el, data) => {
    // Static text with no {{}} bindings is always shown
    if (!HAS_TEMPLATE.test(el.content)) return false
    const resolved = interpolate(el.content, data)
    // Hide if the entire resolved value is empty, or if unresolved {{...}}
    // tokens remain (only happens for system variables without pageContext)
    return resolved === '' || HAS_TEMPLATE.test(resolved)
  },
}
