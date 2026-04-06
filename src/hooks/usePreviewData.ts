/**
 * usePreviewData — merges all DataSource fields into a single flat Record for live preview.
 * Multiple data sources are merged with later sources overriding earlier ones.
 */

import { useMemo } from 'react'
import { useReportStore } from '@/store/reportStore'
import { mergePreviewData } from '@/lib/dataSourceUtils'

export function usePreviewData(): Record<string, unknown> {
  const dataSources = useReportStore((s) => s.definition.dataSources)

  return useMemo(() => mergePreviewData(dataSources), [dataSources])
}
