/**
 * Element registry (#414) — the single registration point for element types.
 *
 * Every element type contributes one `ElementDef` (from `src/elements/{type}/index.tsx`)
 * and is registered here. The map type is `Record` over the full
 * `ReportElement['type']` union, so TypeScript enforces exhaustiveness both
 * ways: adding a type to the union without registering it here is a compile
 * error (and so is registering an unknown key) — the same guarantee the old
 * per-file `assertNever` switches provided, now in one place.
 *
 * Consumers:
 * - `ElementRenderer` → `getElementDef(type).renderElement(ctx)`
 * - sidebar `PropertiesPanel` → `def.PropertiesPanel`
 * - `layerUtils` → `def.layerIcon` / `def.layerName`
 * - binding editor / schema drop → `def.bindable` (via `BINDABLE_TYPES`)
 * - preview empty-suppression → `isDataEmptyInPreview` (below; moved out of
 *   `src/lib/previewUtils.ts` because lib must not import elements, #436)
 *
 * All defs are eager imports — same loading behavior as the previous
 * ElementRenderer / PropertiesPanel dispatchers (no bundle change).
 */
import type { ReportElement } from '@/types'
import type { ElementType } from '@/types/elementTypes'
import type { ElementDef } from './elementDef'

import { textDef } from './text'
import { dataFieldDef } from './dataField'
import { chartDef } from './chart'
import { repeatingBandDef } from './repeatingBand'
import { repeatingListDef } from './repeatingList'
import { formTableDef } from './formTable'
import { shapeDef } from './shape'
import { imageDef } from './image'
import { barcodeDef } from './barcode'
import { manualEntryDef } from './manualEntry'
import { checkboxDef } from './checkbox'
import { eraSelectDef } from './eraSelect'
import { hankoDef } from './hanko'
import { approvalStampRowDef } from './approvalStampRow'
import { revenueStampDef } from './revenueStamp'
import { pageNumberDef } from './pageNumber'
import { currentDateDef } from './currentDate'
import { dividerDef } from './divider'
import { tenantCompanyNameDef } from './tenantCompanyName'
import { tenantAddressDef } from './tenantAddress'
import { tenantPhoneDef } from './tenantPhone'
import { tenantRepresentativeDef } from './tenantRepresentative'
import { tenantLogoDef } from './tenantLogo'
import { tenantCustomDef } from './tenantCustom'

/** Per-key precise map: each key holds the def narrowed to its own element type. */
type ElementDefMap = {
  [K in ElementType]: ElementDef<Extract<ReportElement, { type: K }>>
}

export const ELEMENT_REGISTRY: ElementDefMap = {
  text: textDef,
  dataField: dataFieldDef,
  chart: chartDef,
  repeatingBand: repeatingBandDef,
  repeatingList: repeatingListDef,
  formTable: formTableDef,
  shape: shapeDef,
  image: imageDef,
  barcode: barcodeDef,
  manualEntry: manualEntryDef,
  checkbox: checkboxDef,
  eraSelect: eraSelectDef,
  hanko: hankoDef,
  approvalStampRow: approvalStampRowDef,
  revenueStamp: revenueStampDef,
  pageNumber: pageNumberDef,
  currentDate: currentDateDef,
  divider: dividerDef,
  tenantCompanyName: tenantCompanyNameDef,
  tenantAddress: tenantAddressDef,
  tenantPhone: tenantPhoneDef,
  tenantRepresentative: tenantRepresentativeDef,
  tenantLogo: tenantLogoDef,
  tenantCustom: tenantCustomDef,
}

/**
 * Widened lookup for dispatch sites that hold a `ReportElement` union value.
 * The cast is sound because `ELEMENT_REGISTRY`'s type guarantees the def under
 * key `type` accepts exactly that element type. Throws for unknown types
 * (same behavior as the former `assertNever` in the dispatchers).
 */
export function getElementDef(type: ReportElement['type']): ElementDef {
  const def = ELEMENT_REGISTRY[type] as unknown as ElementDef | undefined
  if (!def) throw new Error(`Unhandled element type: ${String(type)}`)
  return def
}

/**
 * Returns `true` when an element has a data binding configured but the bound
 * data resolved to empty — used in readonly (preview/export) mode to suppress
 * placeholder display (e.g. grey-italic field name, `{{fieldKey}}` literal,
 * empty repeating band header row).
 *
 * Static elements without any binding always return `false` and are shown
 * regardless of data presence. The per-type logic lives in each def's
 * `isEmptyInPreview` (currently: `dataField`, `text`, `repeatingBand`, `chart`).
 *
 * Moved here from `src/lib/previewUtils.ts` (#414) — dispatch is now
 * registry-driven, and lib may not import elements (#436).
 */
export function isDataEmptyInPreview(
  element: ReportElement,
  data: Record<string, unknown>,
  calculationOutputKeys?: Set<string>,
): boolean {
  return getElementDef(element.type).isEmptyInPreview?.(element, data, calculationOutputKeys) ?? false
}
