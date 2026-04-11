/**
 * ElementRenderer — thin dispatcher that routes to type-specific renderers.
 * Each element type lives in src/elements/{type}/Renderer.tsx.
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

import { memo, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store'
import type { ReportElement, TextStyle } from '@/types'
import { evaluateConditionalDisplay } from '@/lib/conditionEvaluator'
import { isDataEmptyInPreview } from '@/lib/previewUtils'

import { TextRenderer } from '@/elements/text/Renderer'
import { LabelRenderer } from '@/elements/label/Renderer'
import { DataFieldRenderer } from '@/elements/dataField/Renderer'
import { ImageRenderer } from '@/elements/image/Renderer'
import { ShapeRenderer } from '@/elements/shape/Renderer'
import { ChartRenderer } from '@/elements/chart/Renderer'
import { BarcodeRenderer } from '@/elements/barcode/Renderer'
import { ManualEntryRenderer } from '@/elements/manualEntry/Renderer'
import { HankoRenderer } from '@/elements/hanko/Renderer'
import { ApprovalStampRowRenderer } from '@/elements/approvalStampRow/Renderer'
import { RevenueStampRenderer } from '@/elements/revenueStamp/Renderer'
import { RepeatingBandRenderer } from '@/elements/repeatingBand/Renderer'
import { RepeatingListRenderer } from '@/elements/repeatingList/Renderer'
import { FormTableRenderer } from '@/elements/formTable/Renderer'
import { CheckboxRenderer } from '@/elements/checkbox/Renderer'
import { EraSelectRenderer } from '@/elements/eraSelect/Renderer'
import { PageNumberRenderer } from '@/elements/pageNumber/Renderer'
import { CurrentDateRenderer } from '@/elements/currentDate/Renderer'
import { DividerRenderer } from '@/elements/divider/Renderer'
import { TenantCompanyNameRenderer } from '@/elements/tenantCompanyName/Renderer'
import { TenantAddressRenderer } from '@/elements/tenantAddress/Renderer'
import { TenantPhoneRenderer } from '@/elements/tenantPhone/Renderer'
import { TenantRepresentativeRenderer } from '@/elements/tenantRepresentative/Renderer'

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
}

export const ElementRenderer = memo(function ElementRenderer({ element, data = {}, rowIndex, readonly = false, pageIndex, totalPages }: Props) {
  // Merge computedValues into data so calculated fields are available to all renderers.
  // useShallow: re-render only when computedValues keys or values actually change.
  const computedValues = useReportStore(useShallow((s) => s.computedValues))

  // Subscribe to defaultTextStyle once here (not in each TextRenderer) to avoid
  // N individual store subscriptions that fire on every unrelated state change.
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))
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

  // In readonly mode (preview / PDF-PNG export): hide elements whose data binding
  // resolves to empty so that placeholder displays (grey-italic field names,
  // empty repeating-band headers, etc.) are suppressed in the final output.
  // Editor mode (readonly=false) is unaffected — designers need to see placeholders.
  // Must be declared before any early returns to satisfy React's Rules of Hooks.
  const isEmptyInPreview = useMemo(() => {
    if (!readonly) return false
    return isDataEmptyInPreview(element, mergedData)
  }, [readonly, element, mergedData])

  if (!element.visible || !isConditionVisible) return null
  if (isEmptyInPreview) return null

  switch (element.type) {
    case 'text':            return <TextRenderer element={element} data={mergedData} defaultStyle={defaultTextStyle} />
    // label → text: migration converts at load time; this branch is a safety net for
    // any label element that bypasses migration (e.g. via direct store writes).
    // LabelRenderer uses TextContent which reads el.text — correct for LabelElement.
    case 'label':           return <LabelRenderer element={element} />
    case 'dataField':       return <DataFieldRenderer element={element} data={mergedData} />
    case 'image':           return <ImageRenderer element={element} />
    case 'shape':           return <ShapeRenderer element={element} />
    // table → formTable migration: render as placeholder until manually converted
    case 'table':           return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef3c7', border: '1px solid #f59e0b', fontSize: '2.5mm', color: '#92400e' }}>旧テーブル要素 — formTable に変換してください</div>
    case 'chart':           return <ChartRenderer element={element} data={mergedData} />
    case 'barcode':         return <BarcodeRenderer element={element} data={mergedData} />
    case 'manualEntry':     return <ManualEntryRenderer element={element} data={mergedData} />
    case 'hanko':           return <HankoRenderer element={element} data={mergedData} />
    case 'approvalStampRow': return <ApprovalStampRowRenderer element={element} />
    case 'revenueStamp':    return <RevenueStampRenderer element={element} />
    case 'repeatingBand': {
      const bandRecords = element.dataSource
        ? (mergedData[element.dataSource] as Record<string, unknown>[] | undefined)
        : undefined
      return <RepeatingBandRenderer element={element} records={bandRecords} />
    }
    case 'repeatingList': {
      const listRecords = element.dataSource
        ? (mergedData[element.dataSource] as Record<string, unknown>[] | undefined)
        : undefined
      return <RepeatingListRenderer element={element} records={listRecords} />
    }
    case 'formTable': {
      const tableRecords = element.dataSource
        ? (mergedData[element.dataSource] as Record<string, unknown>[] | undefined)
        : undefined
      return <FormTableRenderer element={element} records={tableRecords} />
    }
    case 'checkbox':        return <CheckboxRenderer element={element} data={mergedData} />
    case 'eraSelect':       return <EraSelectRenderer element={element} data={mergedData} />
    case 'pageNumber':      return <PageNumberRenderer element={element} resolveValues={readonly} pageIndex={pageIndex} totalPages={totalPages} />
    case 'currentDate':     return <CurrentDateRenderer element={element} resolveValues={readonly} />
    case 'divider':               return <DividerRenderer element={element} />
    case 'tenantCompanyName':     return <TenantCompanyNameRenderer element={element} resolveValues={readonly} />
    case 'tenantAddress':         return <TenantAddressRenderer element={element} resolveValues={readonly} />
    case 'tenantPhone':           return <TenantPhoneRenderer element={element} resolveValues={readonly} />
    case 'tenantRepresentative':  return <TenantRepresentativeRenderer element={element} resolveValues={readonly} />
    // Phase 5-6: logo and custom — added below after those renderers are created
    case 'tenantLogo':
    case 'tenantCustom':
      return null
    default:                      return assertNever(element)
  }
})

function assertNever(x: never): never {
  throw new Error(`Unhandled element type: ${(x as { type: string }).type}`)
}
