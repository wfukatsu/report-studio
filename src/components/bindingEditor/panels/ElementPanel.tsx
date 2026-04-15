/**
 * ElementPanel — Left panel of the BindingEditor.
 *
 * Shows template elements grouped by page, with binding status.
 * Includes operation guidance bar and visual distinction for bound/unbound.
 */

import { memo, useCallback, useState } from 'react'
import { Layers, Search, X } from 'lucide-react'
import { ElementGroupBlock } from '../internals/ElementGroupBlock'
import type { BindingState } from '../hooks/useBindingState'

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
  const [searchQuery, setSearchQuery] = useState('')

  const handleConnect = useCallback(
    (pageId: string, elementId: string) => bs.connect(pageId, elementId),
    [bs.connect],
  )

  const handleDisconnect = useCallback(
    (pageId: string, elementId: string) => bs.disconnect(pageId, elementId),
    [bs.disconnect],
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
          テンプレート要素
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {bs.isDragging
            ? '要素の上でドロップして接続'
            : bs.selectedFieldId
              ? '接続する要素をクリック'
              : `${bs.boundElements}/${bs.totalElements} バインド済み`}
        </p>
      </div>

      {/* Search filter (P4-14) */}
      <div className="px-2 py-1.5 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            className="w-full pl-6 pr-6 py-1 text-xs border rounded bg-background"
            placeholder="要素を検索..."
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
            <span>{searchQuery ? '該当する要素がありません' : 'バインド可能な要素がありません'}</span>
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
              isDragging={bs.isDragging}
              fieldMap={bs.fieldMap}
              groupIndexMap={bs.groupIndexMap}
              hoveredFieldId={bs.hoveredFieldId}
              onToggle={onToggleGroup}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onPointerUp={bs.handleElementPointerUp}
              onNavigate={bs.navigateToElement}
              elementRef={elementRef}
            />
          ))
        )}
      </div>

      {/* Selection/drag status bar */}
      {bs.selectedFieldId && !bs.isDragging && (
        <div className="bg-primary/10 border-t px-3 py-2 text-xs text-primary flex items-center gap-2 shrink-0">
          <span className="font-medium truncate">
            選択中: {bs.fieldMap.get(bs.selectedFieldId)?.fieldKey ?? bs.selectedFieldId}
          </span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
            onClick={bs.clearSelection}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {bs.isDragging && (
        <div className="bg-primary/10 border-t px-3 py-2 text-xs text-primary flex items-center gap-2 shrink-0 animate-pulse">
          <span className="font-medium truncate">
            ドラッグ中: {bs.fieldMap.get(bs.dragState!.fieldId)?.fieldKey}
          </span>
        </div>
      )}
    </div>
  )
})
