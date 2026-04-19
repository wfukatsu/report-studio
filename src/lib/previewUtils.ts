/**
 * Utilities for preview and export rendering mode.
 *
 * These helpers are only active when `readonly = true` (preview panel,
 * preview modal, PDF/PNG export). Editor mode is unaffected.
 */
import type { ReportElement } from '@/types'
import { resolveField, interpolate } from './dataBinding'

/** Regex to detect unresolved {{...}} template tokens. */
const HAS_TEMPLATE = /\{\{[^}]+\}\}/

/**
 * Returns `true` when an element has a data binding configured but the bound
 * data resolved to empty — used in readonly (preview/export) mode to suppress
 * placeholder display (e.g. grey-italic field name, `{{fieldKey}}` literal,
 * empty repeating band header row).
 *
 * Static elements without any binding always return `false` and are shown
 * regardless of data presence.
 *
 * Affected element types:
 *  - `dataField`     — resolveField() returns ''
 *  - `text`          — interpolate() returns '' or still contains {{...}}
 *  - `repeatingBand` — bound data array has 0 items
 *  - `chart`         — bound data array has 0 items
 *  - all others      — always false (static, no binding)
 *
 * NOTE: `interpolate()` replaces `{{missingKey}}` with '' (empty string),
 * NOT with the original `{{missingKey}}` literal. The only case where `{{...}}`
 * remains in the result is for system variables (`$page`, `$totalPages`,
 * `$printDate`) when `TextRenderer` calls `interpolate()` without a pageContext.
 */
export function isDataEmptyInPreview(
  element: ReportElement,
  data: Record<string, unknown>,
  calculationOutputKeys?: Set<string>,
): boolean {
  switch (element.type) {
    case 'dataField':
      // Never hide calculated fields — their value may not have arrived yet
      // (async evaluation via useEvaluator) but they will resolve eventually.
      if (calculationOutputKeys?.has(element.fieldKey)) return false
      // Never hide fields that have fallbackText — the renderer will show it
      // when the bound data is empty (e.g. sample data not configured).
      if (element.fallbackText) return false
      // resolveField() returns '' for missing / null / undefined keys
      return resolveField(data, element.fieldKey) === ''

    case 'text': {
      // Static text with no {{}} bindings is always shown
      if (!HAS_TEMPLATE.test(element.content)) return false
      const resolved = interpolate(element.content, data)
      // Hide if the entire resolved value is empty, or if unresolved {{...}}
      // tokens remain (only happens for system variables without pageContext)
      return resolved === '' || HAS_TEMPLATE.test(resolved)
    }

    case 'repeatingBand': {
      // If no dataSource configured, treat as static (no binding)
      if (!element.dataSource) return false
      const items = data[element.dataSource]
      return !Array.isArray(items) || items.length === 0
    }

    case 'chart': {
      // If no dataBinding configured, ChartRenderer falls back to SAMPLE_DATA — show it
      if (!element.dataBinding) return false
      const items = data[element.dataBinding]
      return !Array.isArray(items) || items.length === 0
    }

    default:
      // shape, image, pageNumber, currentDate, divider, hanko,
      // approvalStampRow, revenueStamp, manualEntry, checkbox, eraSelect,
      // repeatingList, formTable, barcode — no binding or handled elsewhere
      return false
  }
}
