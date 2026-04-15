/**
 * ElementPanel — Left panel of the BindingEditor.
 *
 * Shows template elements grouped by page, with binding status.
 * Supports click-to-connect and drag-to-connect interactions.
 */

import { memo, useCallback } from 'react'
import { Layers } from 'lucide-react'
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
  const handleConnect = useCallback(
    (pageId: string, elementId: string) => bs.connect(pageId, elementId),
    [bs.connect],
  )

  const handleDisconnect = useCallback(
    (pageId: string, elementId: string) => bs.disconnect(pageId, elementId),
    [bs.disconnect],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          テンプレート要素
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {bs.isDragging
            ? '要素にドロップして接続'
            : bs.selectedFieldId
              ? '要素をクリックして接続'
              : `${bs.boundElements}/${bs.totalElements} バインド済み`}
        </p>
      </div>

      {/* Element groups */}
      <div className="flex-1 overflow-y-auto">
        {bs.elementGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[10px] text-muted-foreground gap-2">
            <Layers className="w-6 h-6 opacity-40" />
            <span>バインド可能な要素がありません</span>
          </div>
        ) : (
          bs.elementGroups.map((group) => (
            <ElementGroupBlock
              key={group.pageId}
              pageId={group.pageId}
              pageLabel={group.pageLabel}
              elements={group.elements}
              expanded={expandedGroups.has(group.pageId)}
              selectedFieldId={bs.selectedFieldId}
              isDragging={bs.isDragging}
              fieldMap={bs.fieldMap}
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

      {/* Selection status bar */}
      {bs.selectedFieldId && !bs.isDragging && (
        <div className="bg-primary/10 border-t px-3 py-1.5 text-[10px] text-primary flex items-center gap-2 shrink-0">
          <span className="font-medium truncate">
            選択中: {bs.fieldMap.get(bs.selectedFieldId)?.fieldKey ?? bs.selectedFieldId}
          </span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
            onClick={bs.clearSelection}
          >
            ✕
          </button>
        </div>
      )}

      {/* Drag status bar */}
      {bs.isDragging && (
        <div className="bg-primary/10 border-t px-3 py-1.5 text-[10px] text-primary flex items-center gap-2 shrink-0">
          <span className="font-medium truncate">
            ドラッグ中: {bs.fieldMap.get(bs.dragState!.fieldId)?.fieldKey}
          </span>
        </div>
      )}
    </div>
  )
})
