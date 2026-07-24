import { createElement } from 'react'
import type { TFunction } from 'i18next'
import type { ReportElement, Section } from '@/types'
import { getElementDef } from '@/elements/registry'

// Icon and default-name lookups are registry-driven (#414): each element's
// ElementDef supplies `layerIcon` / `layerName`, and the registry's Record
// type enforces exhaustiveness at compile time (the former assertNever role).

export function elementIcon(type: ReportElement['type']) {
  return createElement(getElementDef(type).layerIcon, { className: 'w-3.5 h-3.5 shrink-0' })
}

export function defaultName(el: ReportElement, t: TFunction<'components'>): string {
  if (el.name) return el.name
  return getElementDef(el.type).layerName(el, t)
}

export function sectionLabel(sectionType: Section['sectionType'], t: TFunction<'components'>): string {
  switch (sectionType) {
    case 'header': return t('sidebar.layerUtils.sectionHeader')
    case 'footer': return t('sidebar.layerUtils.sectionFooter')
    case 'body':   return t('sidebar.layerUtils.sectionBody')
    case 'custom': return t('sidebar.layerUtils.sectionCustom')
  }
}
