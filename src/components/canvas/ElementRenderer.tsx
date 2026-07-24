/**
 * ElementRenderer — thin dispatcher that routes to type-specific renderers
 * via the element registry (#414). Each element type lives in
 * src/elements/{type}/ (Renderer.tsx + index.tsx ElementDef); the per-type
 * prop differences (resolveValues / records / sampleHint …) are absorbed by
 * each def's `renderElement` adapter.
 *
 * P1: computedValues from the store are merged into `data` so that all child
 * renderers can reference calculated field values (e.g. {{total}}, fieldKey="subtotal")
 * without any changes to the individual renderer implementations.
 *
 * Note: memo() prevents re-renders from prop changes, but the useShallow subscription
 * to computedValues means this component will re-render when computedValues changes.
 * P2 task: lift computedValues subscription to the parent canvas component to reduce
 * N subscriptions (one per element) down to 1.
 */

import { memo, useCallback, useMemo } from 'react'
import { useReportStore } from '@/store/reportStore'
import type { RepeatingBandField } from '@/types'
import type { ReportElement, TextStyle } from '@/types'
import { evaluateConditionalDisplay } from '@/lib/conditionEvaluator'
import { getElementDef, isDataEmptyInPreview } from '@/elements/registry'

interface Props {
  element: ReportElement
  data?: Record<string, unknown>
  /** Row index for detail-row conditional display evaluation */
  rowIndex?: number
  /** When true (preview/export), auto-fields resolve actual values */
  readonly?: boolean
  /** 1-based page index (for pageNumber elements) */
  pageIndex?: number
  /** Total page count (for pageNumber elements) */
  totalPages?: number
  /** Computed field values from store — lifted from parent to avoid N subscriptions */
  computedValues?: Record<string, unknown>
  /** Default text style from store — lifted from parent to avoid N subscriptions */
  defaultTextStyle?: TextStyle
  /** Calculation-output keys from store — lifted from parent to avoid N subscriptions (#218) */
  calcOutputKeys?: Set<string>
}

const EMPTY_KEY_SET: Set<string> = new Set()

export const ElementRenderer = memo(function ElementRenderer({
  element, data = {}, rowIndex, readonly = false, pageIndex, totalPages,
  computedValues = {}, defaultTextStyle = {} as TextStyle, calcOutputKeys = EMPTY_KEY_SET,
}: Props) {
  // Memoize merged data so the object reference is stable across renders when
  // neither data nor computedValues have changed (prevents useMemo churn below).
  const mergedData = useMemo<Record<string, unknown>>(
    () => ({ ...data, ...computedValues }),
    [data, computedValues],
  )

  // Evaluate structured visibility conditions (memoized — re-runs only when cd or data changes)
  const isConditionVisible = useMemo(() => {
    if (!element.conditionalDisplay) return true
    return evaluateConditionalDisplay(element.conditionalDisplay, mergedData, rowIndex)
  }, [element.conditionalDisplay, mergedData, rowIndex])

  // calcOutputKeys is supplied by the parent (SectionContainer) so isDataEmptyInPreview never
  // hides a calculation-produced field — subscribed once there, not per element (#218).

  // In readonly mode (preview / PDF-PNG export): hide elements whose data binding
  // resolves to empty so that placeholder displays (grey-italic field names,
  // empty repeating-band headers, etc.) are suppressed in the final output.
  // Editor mode (readonly=false) is unaffected — designers need to see placeholders.
  // Must be declared before any early returns to satisfy React's Rules of Hooks.
  const isEmptyInPreview = useMemo(() => {
    if (!readonly) return false
    return isDataEmptyInPreview(element, mergedData, calcOutputKeys)
  }, [readonly, element, mergedData, calcOutputKeys])

  // Callback for repeatingBand inline column editing (design mode only)
  const updateElement = useReportStore((s) => s.updateElement)
  const activePageId = useReportStore((s) => s.selection.activePageId)
  const onBandFieldsChange = useCallback(
    (fields: RepeatingBandField[]) => {
      if (!activePageId) return
      updateElement(activePageId, element.id, { fields })
    },
    [activePageId, element.id, updateElement],
  )

  if (!element.visible || !isConditionVisible) return null
  if (isEmptyInPreview) return null

  const def = getElementDef(element.type)
  return def.renderElement({
    element,
    data: mergedData,
    readonly,
    defaultStyle: defaultTextStyle,
    pageIndex,
    totalPages,
    onBandFieldsChange,
  })
})
