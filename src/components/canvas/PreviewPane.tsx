/**
 * PreviewPane — shows the active page rendered with live test data.
 * Uses useDeferredValue for low-priority rendering to keep the editor responsive.
 */

import { memo, useDeferredValue, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { useReportStore, selectActivePage } from '@/store/reportStore'
import { usePreviewData } from '@/hooks/usePreviewData'
import { ReportCanvas } from './ReportCanvas'
import { ZoomControl } from '@/components/common/ZoomControl'

export const PreviewPane = memo(function PreviewPane() {
  const activePage = useReportStore(selectActivePage)
  const rawPreviewData = usePreviewData()
  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const previewZoom = useReportStore((s) => s.previewZoom)
  const setPreviewZoom = useReportStore((s) => s.setPreviewZoom)

  const containerRef = useRef<HTMLDivElement>(null)

  // Defer BOTH to prevent re-renders during drag/resize
  const deferredPage = useDeferredValue(activePage)
  const deferredData = useDeferredValue(rawPreviewData)
  const isPending = activePage !== deferredPage || rawPreviewData !== deferredData

  const pageIndex = activePage ? pages.findIndex((p) => p.id === activePage.id) : -1
  const pageLabel = pageIndex >= 0 ? `${pageIndex + 1} / ${pages.length}` : '—'

  if (!deferredPage) return null

  return (
    <div className="border-l bg-muted/20 flex-1 flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto p-2 ${isPending ? 'opacity-70' : ''}`}
      >
        <ReportCanvas
          pageOverride={deferredPage}
          dataOverride={deferredData}
          readonly={true}
        />
      </div>
      <div
        className="border-t bg-card px-3 flex items-center gap-4 text-[10px] text-muted-foreground shrink-0 select-none"
        style={{ height: 24 }}
      >
        <span className="font-semibold uppercase tracking-wide">ライブプレビュー</span>
        <span className="border-l h-3" />
        <span>ページ {pageLabel}</span>
        <ZoomControl
          zoom={previewZoom}
          onSetZoom={setPreviewZoom}
          containerRef={containerRef}
          page={activePage}
        />
      </div>
    </div>
  )
})
