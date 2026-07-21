/**
 * PreviewPane — shows the active page rendered with live test data.
 * Uses useDeferredValue for low-priority rendering to keep the editor responsive.
 */

import { memo, useDeferredValue, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useReportStore, selectActivePage } from '@/store/reportStore'
import { usePreviewData } from '@/hooks/usePreviewData'
import { ReportCanvas } from './ReportCanvas'
import { ZoomControl } from '@/components/common/ZoomControl'

export const PreviewPane = memo(function PreviewPane() {
  const { t } = useTranslation('components')
  const activePage = useReportStore(selectActivePage)
  const rawPreviewData = usePreviewData()
  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const previewZoom = useReportStore((s) => s.previewZoom)
  const setPreviewZoom = useReportStore((s) => s.setPreviewZoom)

  const containerRef = useRef<HTMLDivElement>(null)
  // #112 X-1: let the user widen the preview when the 50/50 split feels cramped.
  const [wide, setWide] = useState(false)

  // Defer BOTH to prevent re-renders during drag/resize
  const deferredPage = useDeferredValue(activePage)
  const deferredData = useDeferredValue(rawPreviewData)
  const isPending = activePage !== deferredPage || rawPreviewData !== deferredData

  const pageIndex = activePage ? pages.findIndex((p) => p.id === activePage.id) : -1
  const pageLabel = pageIndex >= 0 ? `${pageIndex + 1} / ${pages.length}` : '—'

  if (!deferredPage) return null

  return (
    <div className={`border-l bg-muted/20 ${wide ? 'flex-[2]' : 'flex-1'} flex flex-col overflow-hidden`}>
      {/* #235: 上部ラベルで編集側と視覚的に区別 */}
      <div className="relative flex items-center justify-center bg-primary/8 border-b border-primary/20 py-0.5 shrink-0 select-none">
        <span className="text-[10px] font-medium text-primary/70 uppercase tracking-widest">{t('canvas.previewPane.livePreview')}</span>
        <button
          onClick={() => setWide((v) => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
          title={wide ? t('canvas.previewPane.narrowPreview') : t('canvas.previewPane.widenPreview')}
          aria-label={wide ? t('canvas.previewPane.narrowPreview') : t('canvas.previewPane.widenPreview')}
          aria-pressed={wide}
        >
          {wide ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
        </button>
      </div>
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
        <span className="font-semibold uppercase tracking-wide">{t('canvas.previewPane.livePreview')}</span>
        <span className="border-l h-3" />
        <span>{t('canvas.previewPane.page', { label: pageLabel })}</span>
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
