import { useShallow } from 'zustand/shallow'
import { useTranslation } from 'react-i18next'
import { useReportStore, selectActivePage, flattenPageElements } from '@/store/reportStore'
import { ZoomControl } from './ZoomControl'

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function EditorStatusBar({ containerRef }: Props) {
  const { t } = useTranslation('components')
  const editorZoom = useReportStore((s) => s.editorZoom)
  const setEditorZoom = useReportStore((s) => s.setEditorZoom)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))
  const activePage = useReportStore(selectActivePage)

  const selectedElement = activePage && selectedIds.length === 1
    ? flattenPageElements(activePage).find((e) => e.id === selectedIds[0]) ?? null
    : null

  return (
    <div
      className="border-t bg-card px-3 flex items-center gap-4 text-[10px] text-muted-foreground shrink-0 select-none"
      style={{ height: 24 }}
    >
      <span className="font-semibold uppercase tracking-wide">{t('common.editorStatusBar.editor')}</span>
      <span className="border-l h-3" />
      {selectedElement ? (
        <>
          <span>X: {selectedElement.position.x.toFixed(1)} mm</span>
          <span>Y: {selectedElement.position.y.toFixed(1)} mm</span>
          <span>W: {selectedElement.size.width.toFixed(1)} mm</span>
          <span>H: {selectedElement.size.height.toFixed(1)} mm</span>
        </>
      ) : (
        <span className="italic opacity-60">{t('common.editorStatusBar.noSelection')}</span>
      )}
      <ZoomControl
        zoom={editorZoom}
        onSetZoom={setEditorZoom}
        containerRef={containerRef}
        page={activePage}
      />
    </div>
  )
}
