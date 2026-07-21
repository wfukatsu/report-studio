/**
 * ElementPanel — Left panel of the BindingEditor.
 *
 * Shows template elements grouped by page, with binding status.
 * Includes operation guidance bar and visual distinction for bound/unbound.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, Search, X, Info } from 'lucide-react'
import { ElementGroupBlock } from '../internals/ElementGroupBlock'
import type { BindingState } from '../hooks/useBindingState'
import { useReportStore } from '@/store/reportStore'

interface ElementPanelProps {
  readonly bs: BindingState
  readonly expandedGroups: ReadonlySet<string>
  readonly onToggleGroup: (pageId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

export const ElementPanel = memo(function ElementPanel({
  bs,
  expandedGroups,
  onToggleGroup,
  elementRef,
}: ElementPanelProps) {
  const { t } = useTranslation('components')
  const [searchQuery, setSearchQuery] = useState('')

  // Repeating containers (formTable / repeatingBand / repeatingList) bind to a
  // whole array via their data source, not the single-field connection this panel
  // models, so they don't appear in the element list. Surface a note when the
  // template has any, so their absence reads as "bound differently", not "missing"
  // (#161).
  const pages = useReportStore((s) => s.definition.pages)
  const repeatingCount = useMemo(() => {
    let n = 0
    for (const p of pages) {
      for (const s of p.sections ?? []) {
        for (const el of s.elements ?? []) {
          if (el.type === 'formTable' || el.type === 'repeatingBand' || el.type === 'repeatingList') n++
        }
      }
    }
    return n
  }, [pages])

  // Destructured so the callback dependency arrays can list the functions
  // directly (bs itself is a fresh object every render).
  const { connect, disconnect } = bs

  const handleConnect = useCallback(
    (pageId: string, elementId: string) => connect(pageId, elementId),
    [connect],
  )

  const handleDisconnect = useCallback(
    (pageId: string, elementId: string) => disconnect(pageId, elementId),
    [disconnect],
  )

  // Filter elements by search query (filter within sub-groups)
  const filteredGroups = searchQuery.trim()
    ? bs.elementGroups.map((g) => {
        const q = searchQuery.toLowerCase()
        const filteredSubGroups = g.subGroups
          .map((sg) => ({
            ...sg,
            elements: sg.elements.filter((e) =>
              e.elementLabel.toLowerCase().includes(q),
            ),
          }))
          .filter((sg) => sg.elements.length > 0)
        const filteredElements = filteredSubGroups.flatMap((sg) => sg.elements)
        return { ...g, subGroups: filteredSubGroups, elements: filteredElements }
      }).filter((g) => g.elements.length > 0)
    : bs.elementGroups

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0">
        <p className="text-xs font-semibold text-foreground">
          {t('bindingEditor.elementPanel.title')}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {bs.isDragging
            ? t('bindingEditor.elementPanel.dropToConnect')
            : bs.selectedFieldId
              ? t('bindingEditor.elementPanel.clickToConnect')
              : t('bindingEditor.elementPanel.boundStatus', { bound: bs.boundElements, total: bs.totalElements })}
        </p>
      </div>

      {/* Search filter (P4-14) */}
      <div className="px-2 py-1.5 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            className="w-full pl-6 pr-6 py-1 text-xs border rounded bg-background"
            placeholder={t('bindingEditor.elementPanel.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Element groups */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2">
            <Layers className="w-6 h-6 opacity-40" />
            <span>{searchQuery ? t('bindingEditor.elementPanel.noMatch') : t('bindingEditor.elementPanel.noBindable')}</span>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <ElementGroupBlock
              key={group.pageId}
              pageId={group.pageId}
              pageLabel={group.pageLabel}
              subGroups={group.subGroups}
              elements={group.elements}
              expanded={expandedGroups.has(group.pageId)}
              selectedFieldId={bs.selectedFieldId}
              isDraggingField={bs.isDraggingField}
              isDraggingElement={bs.isDraggingElement}
              fieldMap={bs.fieldMap}
              groupIndexMap={bs.groupIndexMap}
              hoveredFieldId={bs.hoveredFieldId}
              onToggle={onToggleGroup}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onDropOnElement={bs.handleDropOnElement}
              onElementDragStart={bs.handleElementDragStart}
              onDragMove={bs.handleDragMove}
              onNavigate={bs.navigateToElement}
              elementRef={elementRef}
            />
          ))
        )}
      </div>

      {/* Repeating-container note (#161) */}
      {repeatingCount > 0 && (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-1.5 shrink-0">
          <Info className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>
            {t('bindingEditor.elementPanel.repeatingNote', { n: repeatingCount })}
          </span>
        </div>
      )}

      {/* Selection/drag status bar */}
      {bs.selectedFieldId && !bs.isDragging && (
        <div className="bg-primary/10 border-t px-3 py-2 text-xs text-primary flex items-center gap-2 shrink-0">
          <span className="font-medium truncate">
            {t('bindingEditor.elementPanel.selectedField', { field: bs.fieldMap.get(bs.selectedFieldId)?.fieldKey ?? bs.selectedFieldId })}
          </span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
            onClick={bs.clearSelection}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {bs.isDraggingField && bs.dragState?.source === 'field' && (
        <div className="bg-primary/10 border-t px-3 py-2 text-xs text-primary flex items-center gap-2 shrink-0 animate-pulse">
          <span className="font-medium truncate">
            {t('bindingEditor.elementPanel.draggingField', { field: bs.fieldMap.get(bs.dragState.fieldId)?.fieldKey })}
          </span>
        </div>
      )}

      {bs.isDraggingElement && bs.dragState?.source === 'element' && (
        <div className="bg-[#00C853]/10 border-t px-3 py-2 text-xs text-[#00C853] flex items-center gap-2 shrink-0 animate-pulse">
          <span className="font-medium truncate">
            {t('bindingEditor.elementPanel.draggingElement', { element: bs.dragState.elementLabel })}
          </span>
        </div>
      )}
    </div>
  )
})
