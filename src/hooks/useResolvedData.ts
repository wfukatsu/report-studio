/**
 * useResolvedData — centralized data priority resolution.
 *
 * Priority: external override > ScalarDB live data > sample JSON > empty object
 *
 * Previously this chain was duplicated in ReportCanvas.tsx and Toolbar.tsx.
 * A single hook ensures canvas display and PDF export use the same data source.
 */

import { useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store/reportStore'
import { buildFlatDataFromResolved } from '@/lib/previewDataTransform'
import { usePreviewData } from './usePreviewData'

const EMPTY_DATA: Record<string, unknown> = {}

/** React hook — use in components for reactive data resolution. */
export function useResolvedData(
  dataOverride?: Record<string, unknown> | null,
): Record<string, unknown> {
  const livePreviewData = useReportStore((s) => s.livePreviewData)
  const schema = useReportStore(useShallow((s) => s.definition.schema))
  const stableLiveData = useMemo(
    () => (livePreviewData ? buildFlatDataFromResolved(livePreviewData, schema) : null),
    [livePreviewData, schema],
  )
  const sampleData = usePreviewData()

  return dataOverride ?? stableLiveData ?? sampleData ?? EMPTY_DATA
}

/**
 * Non-hook version — use in async functions (event handlers, export callbacks).
 * Reads the current store state at call time, same priority as useResolvedData.
 */
export function resolveCurrentData(): Record<string, unknown> {
  const { livePreviewData, testData, definition } = useReportStore.getState()
  if (livePreviewData) {
    return buildFlatDataFromResolved(livePreviewData, definition.schema) as Record<string, unknown>
  }
  return (testData ?? EMPTY_DATA) as Record<string, unknown>
}
