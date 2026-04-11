/**
 * Cross-slice selectors and shared utilities for page/element access.
 */

import type { PageDef, ReportElement } from '@/types'
import type { StoreState } from './types'

// ---------------------------------------------------------------------------
// flattenPageElements — primary utility for accessing elements across sections
// ---------------------------------------------------------------------------

/**
 * Flatten all sections of a page into a single elements array.
 * Use this everywhere you need a flat view of elements (canvas, layers, selectors).
 */
export function flattenPageElements(page: PageDef): ReportElement[] {
  if (page.sections && page.sections.length > 0) {
    return page.sections.flatMap((s) => s.elements)
  }
  return []
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectActivePageId = (s: StoreState): string | null =>
  s.selection.activePageId ?? s.definition.pages[0]?.id ?? null

export const selectActivePage = (s: StoreState): PageDef | null =>
  s.definition.pages.find((p) => p.id === s.selection.activePageId) ??
  s.definition.pages[0] ??
  null

const EMPTY_ELEMENTS: ReportElement[] = []

/**
 * Phase 2: look up a SchemaField's `key` string by its `id` UUID.
 * Returns undefined when the field is not found in the current schema.
 *
 * Usage:
 *   const fieldKey = useReportStore(useCallback(selectSchemaFieldKeyById(element.schemaBinding?.fieldId ?? ''), [...]))
 */
export const selectSchemaFieldKeyById =
  (fieldId: string) =>
  (s: StoreState): string | undefined =>
    s.definition.schema?.groups
      .flatMap((g) => g.fields)
      .find((f) => f.id === fieldId)?.key

export const selectSelectedElements = (s: StoreState): ReportElement[] => {
  const page = selectActivePage(s)
  if (!page) return EMPTY_ELEMENTS
  if (s.selection.selectedElementIds.length === 0) return EMPTY_ELEMENTS
  const allElements = flattenPageElements(page)
  const selected = allElements.filter((e) =>
    s.selection.selectedElementIds.includes(e.id),
  )
  return selected.length === 0 ? EMPTY_ELEMENTS : selected
}
