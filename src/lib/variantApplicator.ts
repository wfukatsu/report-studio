/**
 * variantApplicator — apply an OutputVariant to a set of pages before PDF export.
 *
 * Creates a new page array (immutable) with:
 * - Hidden elements removed (via hiddenElementIds)
 * - Text content replaced / masked (fullReplace / partial)
 *
 * The original pages are never mutated.
 */

import type { PageDef, ReportElement, OutputVariant, MaskingRule } from '@/types'

// ---------------------------------------------------------------------------
// Partial mask helper
// ---------------------------------------------------------------------------

/**
 * Partial mask: keep `keepFirst` leading and `keepLast` trailing chars, star
 * the middle. Shared with the client PDF fallback so masking is defined once
 * (issue #61). Returns the original when the kept edges cover the whole string.
 */
export function applyPartialMask(value: string, keepFirst?: number, keepLast?: number): string {
  const len = value.length
  const first = keepFirst ?? 0
  const last = keepLast ?? 0
  if (first + last >= len) return value
  const suffix = last > 0 ? value.slice(len - last) : ''
  return value.slice(0, first) + '*'.repeat(len - first - last) + suffix
}

// ---------------------------------------------------------------------------
// Single element masking
// ---------------------------------------------------------------------------

function applyMaskingToElement(el: ReportElement, rules: MaskingRule[]): ReportElement {
  const rule = rules.find((r) => r.targetElementId === el.id)
  if (!rule) return el

  if (rule.type === 'fullReplace') {
    // text: replace inline content
    if (el.type === 'text') {
      return { ...el, content: rule.replaceValue } as ReportElement
    }
    // dataField: replace with static override value, clear dynamic field binding
    if (el.type === 'dataField') {
      return { ...el, fieldKey: '' as string, fallbackText: rule.replaceValue ?? '' } as ReportElement
    }
    return el
  }

  if (rule.type === 'partial') {
    if (el.type === 'text') {
      const content = typeof el.content === 'string' ? el.content : ''
      return { ...el, content: applyPartialMask(content, rule.keepFirst, rule.keepLast) }
    }
    // dataField partial: mask via fallbackText (field key set to empty so fallbackText shows at render)
    if (el.type === 'dataField') {
      const placeholder = applyPartialMask(el.fieldKey ?? '', rule.keepFirst, rule.keepLast)
      return { ...el, fieldKey: '' as string, fallbackText: placeholder } as ReportElement
    }
    return el
  }

  return el
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Apply a variant to pages, returning a new page array safe for PDF export.
 * Returns the original pages unchanged when variant is null.
 */
export function applyVariant(pages: PageDef[], variant: OutputVariant | null): PageDef[] {
  if (!variant) return pages

  const hiddenSet = new Set(variant.hiddenElementIds)

  return pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      elements: section.elements
        .filter((el) => !hiddenSet.has(el.id))
        .map((el) => applyMaskingToElement(el, variant.maskingRules)),
    })),
  }))
}
