/**
 * ElementGroupBlock — Collapsible group of bindable template elements.
 *
 * Visual distinction: bound elements show green dot, unbound show orange dot.
 * Supports click-to-connect, drag-to-connect, and hover highlight.
 */

import { memo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Circle, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BindableElement, FieldItem } from '../types'
import { getGroupColor } from '../types'

interface ElementGroupBlockProps {
  readonly pageId: string
  readonly pageLabel: string
  readonly elements: readonly BindableElement[]
  readonly expanded: boolean
  readonly selectedFieldId: string | null
  readonly isDragging: boolean
  readonly fieldMap: ReadonlyMap<string, FieldItem>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredFieldId: string | null
  readonly onToggle: (pageId: string) => void
  readonly onConnect: (pageId: string, elementId: string) => void
  readonly onDisconnect: (pageId: string, elementId: string) => void
  readonly onPointerUp: (pageId: string, elementId: string) => void
  readonly onNavigate: (pageId: string, elementId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

const TYPE_ICONS: Record<string, { label: string; color: string }> = {
  dataField: { label: 'DF', color: 'text-blue-600' },
  text: { label: 'T', color: 'text-gray-500' },
  checkbox: { label: 'CB', color: 'text-purple-600' },
  eraSelect: { label: '元', color: 'text-purple-600' },
}

export const ElementGroupBlock = memo(function ElementGroupBlock({
  pageId,
  pageLabel,
  elements,
  expanded,
  selectedFieldId,
  isDragging,
  fieldMap,
  groupIndexMap,
  hoveredFieldId,
  onToggle,
  onConnect,
  onDisconnect,
  onPointerUp,
  onNavigate,
  elementRef,
}: ElementGroupBlockProps) {
  const handleToggle = useCallback(() => onToggle(pageId), [onToggle, pageId])
  const boundCount = elements.filter((e) => e.boundFieldId).length

  return (
    <div className="border-b last:border-b-0">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-1.5 px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={handleToggle}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{pageLabel}</span>
        <span className={cn(
          'ml-auto text-[10px] px-1.5 py-0.5 rounded-full',
          boundCount === elements.length
            ? 'bg-green-100 text-green-700'
            : 'bg-muted text-muted-foreground',
        )}>
          {boundCount}/{elements.length}
        </span>
      </button>

      {/* Element list */}
      {expanded && elements.map((element) => (
        <ElementSlot
          key={element.elementId}
          element={element}
          selectedFieldId={selectedFieldId}
          isDragging={isDragging}
          fieldMap={fieldMap}
          groupIndexMap={groupIndexMap}
          hoveredFieldId={hoveredFieldId}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onPointerUp={onPointerUp}
          onNavigate={onNavigate}
          elementRef={elementRef}
        />
      ))}
    </div>
  )
})

// ---------------------------------------------------------------------------
// ElementSlot
// ---------------------------------------------------------------------------

interface ElementSlotProps {
  readonly element: BindableElement
  readonly selectedFieldId: string | null
  readonly isDragging: boolean
  readonly fieldMap: ReadonlyMap<string, FieldItem>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredFieldId: string | null
  readonly onConnect: (pageId: string, elementId: string) => void
  readonly onDisconnect: (pageId: string, elementId: string) => void
  readonly onPointerUp: (pageId: string, elementId: string) => void
  readonly onNavigate: (pageId: string, elementId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

const ElementSlot = memo(function ElementSlot({
  element,
  selectedFieldId,
  isDragging,
  fieldMap,
  groupIndexMap,
  hoveredFieldId,
  onConnect,
  onDisconnect,
  onPointerUp,
  onNavigate,
  elementRef,
}: ElementSlotProps) {
  const boundField = element.boundFieldId
    ? fieldMap.get(element.boundFieldId)
    : null
  const isConnectedToSelected =
    selectedFieldId !== null && element.boundFieldId === selectedFieldId
  const isHoveredConnection =
    hoveredFieldId !== null && element.boundFieldId === hoveredFieldId
  const typeInfo = TYPE_ICONS[element.elementType] ?? TYPE_ICONS.text
  const groupColor = boundField
    ? getGroupColor(groupIndexMap.get(boundField.groupId) ?? 0)
    : undefined

  function handleClick() {
    if (isDragging) return
    if (selectedFieldId !== null) {
      if (element.boundFieldId === selectedFieldId) {
        onDisconnect(element.pageId, element.elementId)
      } else {
        onConnect(element.pageId, element.elementId)
      }
    } else if (element.boundFieldId) {
      onDisconnect(element.pageId, element.elementId)
    }
  }

  return (
    <button
      ref={(el) => elementRef(element.elementId, el)}
      data-element-id={element.elementId}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors group',
        // Highlight states
        isConnectedToSelected && 'bg-primary/10',
        isHoveredConnection && 'bg-primary/5',
        // Interaction modes
        (selectedFieldId !== null || isDragging) && 'hover:bg-primary/10 cursor-pointer',
        selectedFieldId === null && !isDragging && element.boundFieldId && 'hover:bg-destructive/5',
        // Unbound: dimmed with dashed border indicator
        selectedFieldId === null && !isDragging && !element.boundFieldId && 'hover:bg-accent opacity-50',
      )}
      onClick={handleClick}
      onPointerUp={() => onPointerUp(element.pageId, element.elementId)}
      onDoubleClick={() => onNavigate(element.pageId, element.elementId)}
      title={boundField ? `バインド先: ${boundField.fieldKey} (ダブルクリックでキャンバスに移動)` : '未バインド (ダブルクリックでキャンバスに移動)'}
    >
      {/* Binding status indicator */}
      {boundField ? (
        <CircleDot className="w-3 h-3 shrink-0" style={{ color: groupColor }} />
      ) : (
        <Circle className="w-3 h-3 shrink-0 text-muted-foreground/40" />
      )}

      {/* Type badge */}
      <span className={cn('text-[10px] font-mono shrink-0 w-5', typeInfo.color)}>
        {typeInfo.label}
      </span>

      {/* Element name */}
      <span className="flex-1 truncate">{element.elementLabel}</span>

      {/* Bound field key */}
      {boundField ? (
        <span
          className="text-[10px] font-mono shrink-0 max-w-[35%] truncate px-1 rounded"
          style={{ color: groupColor, backgroundColor: `${groupColor}15` }}
        >
          ← {boundField.fieldKey}
        </span>
      ) : (selectedFieldId !== null || isDragging) ? (
        <span className="text-[10px] text-primary animate-pulse shrink-0">ドロップ</span>
      ) : null}
    </button>
  )
})
