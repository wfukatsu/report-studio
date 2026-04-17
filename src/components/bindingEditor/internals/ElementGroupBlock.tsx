/**
 * ElementGroupBlock — Template elements grouped by page with repeat sub-groups.
 *
 * Shows:
 * - Single items (normal elements)
 * - Repeat sub-groups (elements inside repeatingBand/repeatingList) with ↻ icon
 */

import { memo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Database, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BindableElement, ElementSubGroup, FieldItem } from '../types'
import { getGroupColor } from '../types'

interface ElementGroupBlockProps {
  readonly pageId: string
  readonly pageLabel: string
  readonly subGroups: readonly ElementSubGroup[]
  readonly elements: readonly BindableElement[]
  readonly expanded: boolean
  readonly selectedFieldId: string | null
  readonly isDraggingField: boolean
  readonly isDraggingElement: boolean
  readonly fieldMap: ReadonlyMap<string, FieldItem>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredFieldId: string | null
  readonly onToggle: (pageId: string) => void
  readonly onConnect: (pageId: string, elementId: string) => void
  readonly onDisconnect: (pageId: string, elementId: string) => void
  readonly onDropOnElement: (pageId: string, elementId: string) => void
  readonly onElementDragStart: (e: React.PointerEvent, pageId: string, elementId: string, label: string) => void
  readonly onDragMove: (e: React.PointerEvent) => void
  readonly onNavigate: (pageId: string, elementId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

export const ElementGroupBlock = memo(function ElementGroupBlock({
  pageId,
  pageLabel,
  subGroups,
  elements,
  expanded,
  selectedFieldId,
  isDraggingField,
  isDraggingElement,
  fieldMap,
  groupIndexMap,
  hoveredFieldId,
  onToggle,
  onConnect,
  onDisconnect,
  onDropOnElement,
  onElementDragStart,
  onDragMove,
  onNavigate,
  elementRef,
}: ElementGroupBlockProps) {
  const handleToggle = useCallback(() => onToggle(pageId), [onToggle, pageId])
  const boundCount = elements.filter((e) => e.boundFieldId).length

  return (
    <div className="mb-1">
      {/* Page header */}
      <button
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
        onClick={handleToggle}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate">{pageLabel}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-px rounded-full">
          {boundCount}/{elements.length}
        </span>
      </button>

      {/* Sub-groups */}
      {expanded && subGroups.map((sub) => (
        <SubGroupBlock
          key={sub.id}
          subGroup={sub}
          selectedFieldId={selectedFieldId}
          isDraggingField={isDraggingField}
          isDraggingElement={isDraggingElement}
          fieldMap={fieldMap}
          groupIndexMap={groupIndexMap}
          hoveredFieldId={hoveredFieldId}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onDropOnElement={onDropOnElement}
          onElementDragStart={onElementDragStart}
          onDragMove={onDragMove}
          onNavigate={onNavigate}
          elementRef={elementRef}
        />
      ))}
    </div>
  )
})

// ---------------------------------------------------------------------------
// SubGroupBlock — single items or repeat group
// ---------------------------------------------------------------------------

interface SubGroupBlockProps {
  readonly subGroup: ElementSubGroup
  readonly selectedFieldId: string | null
  readonly isDraggingField: boolean
  readonly isDraggingElement: boolean
  readonly fieldMap: ReadonlyMap<string, FieldItem>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredFieldId: string | null
  readonly onConnect: (pageId: string, elementId: string) => void
  readonly onDisconnect: (pageId: string, elementId: string) => void
  readonly onDropOnElement: (pageId: string, elementId: string) => void
  readonly onElementDragStart: (e: React.PointerEvent, pageId: string, elementId: string, label: string) => void
  readonly onDragMove: (e: React.PointerEvent) => void
  readonly onNavigate: (pageId: string, elementId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

const SubGroupBlock = memo(function SubGroupBlock({
  subGroup,
  selectedFieldId,
  isDraggingField,
  isDraggingElement,
  fieldMap,
  groupIndexMap,
  hoveredFieldId,
  onConnect,
  onDisconnect,
  onDropOnElement,
  onElementDragStart,
  onDragMove,
  onNavigate,
  elementRef,
}: SubGroupBlockProps) {
  const isRepeat = subGroup.role === 'repeat'
  const isMaster = subGroup.role === 'master'
  const isSchemaGroup = isRepeat || isMaster

  return (
    <div className={cn('px-1 pb-0.5', isSchemaGroup && 'ml-2')}>
      {/* Sub-group label */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium',
        isRepeat
          ? 'text-amber-600'
          : isMaster
            ? 'text-blue-600'
            : 'text-muted-foreground',
      )}>
        {isRepeat && <RefreshCw className="w-3 h-3" />}
        {isMaster && <Database className="w-3 h-3" />}
        <span>{subGroup.label}</span>
        {isMaster && (
          <span className="font-mono text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 rounded">
            マスター
          </span>
        )}
        {isRepeat && (
          <span className="font-mono text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1 rounded">
            明細
          </span>
        )}
        {isRepeat && subGroup.dataSource && (
          <span className="font-mono text-[9px] bg-amber-50/60 text-amber-500 border border-amber-200/60 px-1 rounded">
            {subGroup.dataSource}
          </span>
        )}
      </div>

      {/* Element cards */}
      <div className={cn(
        'flex flex-col gap-1',
        isRepeat && 'border-l-2 border-amber-300/50 pl-1.5',
        isMaster && 'border-l-2 border-blue-300/50 pl-1.5',
      )}>
        {subGroup.elements.map((element) => (
          <ElementSlot
            key={element.elementId}
            element={element}
            selectedFieldId={selectedFieldId}
            isDraggingField={isDraggingField}
            isDraggingElement={isDraggingElement}
            fieldMap={fieldMap}
            groupIndexMap={groupIndexMap}
            hoveredFieldId={hoveredFieldId}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onDropOnElement={onDropOnElement}
            onElementDragStart={onElementDragStart}
            onDragMove={onDragMove}
            onNavigate={onNavigate}
            elementRef={elementRef}
          />
        ))}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// ElementSlot — v1-style card with bound/unbound visual distinction
// ---------------------------------------------------------------------------

interface ElementSlotProps {
  readonly element: BindableElement
  readonly selectedFieldId: string | null
  readonly isDraggingField: boolean
  readonly isDraggingElement: boolean
  readonly fieldMap: ReadonlyMap<string, FieldItem>
  readonly groupIndexMap: ReadonlyMap<string, number>
  readonly hoveredFieldId: string | null
  readonly onConnect: (pageId: string, elementId: string) => void
  readonly onDisconnect: (pageId: string, elementId: string) => void
  readonly onDropOnElement: (pageId: string, elementId: string) => void
  readonly onElementDragStart: (e: React.PointerEvent, pageId: string, elementId: string, label: string) => void
  readonly onDragMove: (e: React.PointerEvent) => void
  readonly onNavigate: (pageId: string, elementId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

const ElementSlot = memo(function ElementSlot({
  element,
  selectedFieldId,
  isDraggingField,
  isDraggingElement,
  fieldMap,
  groupIndexMap,
  hoveredFieldId,
  onConnect,
  onDisconnect,
  onDropOnElement,
  onElementDragStart,
  onDragMove,
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
  const groupColor = boundField
    ? getGroupColor(groupIndexMap.get(boundField.groupId) ?? 0)
    : undefined

  const isDragging = isDraggingField || isDraggingElement

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
        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left transition-all cursor-grab',
        boundField
          ? 'border-2 border-[#00C853]/40 bg-[#00C853]/5'
          : 'border-2 border-dashed border-border/60 bg-background',
        isConnectedToSelected && 'ring-2 ring-[#6366f1]/30',
        isHoveredConnection && 'bg-[#6366f1]/5',
        // Drop target highlight (when dragging a field onto this element)
        isDraggingField && 'hover:ring-2 hover:ring-[#6366f1] hover:bg-[#6366f1]/10 hover:border-[#6366f1]/40 cursor-pointer',
        // Click-to-connect mode
        !isDragging && selectedFieldId !== null && 'hover:bg-[#6366f1]/10 hover:border-[#6366f1]/40 cursor-pointer',
        !isDragging && selectedFieldId === null && boundField && 'hover:border-red-300 hover:bg-red-50/50',
      )}
      onClick={handleClick}
      onPointerDown={(e) => onElementDragStart(e, element.pageId, element.elementId, element.elementLabel)}
      onPointerMove={onDragMove}
      onPointerUp={() => { if (isDraggingField) onDropOnElement(element.pageId, element.elementId) }}
      onDoubleClick={() => onNavigate(element.pageId, element.elementId)}
      title={boundField ? `バインド先: ${boundField.fieldKey}` : '未バインド — ドラッグでフィールドに接続'}
    >
      {/* Binding dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0 transition-colors"
        style={{
          backgroundColor: boundField ? (groupColor ?? '#00C853') : 'var(--border)',
          boxShadow: boundField ? `0 0 0 2px ${groupColor ?? '#00C853'}33` : undefined,
        }}
      />

      {/* Element name */}
      <span className={cn(
        'flex-1 truncate font-medium',
        boundField ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {element.elementLabel}
      </span>

      {/* Bound field indicator */}
      {boundField ? (
        <span
          className="text-[10px] font-mono shrink-0 max-w-[40%] truncate"
          style={{ color: groupColor }}
        >
          ← {boundField.fieldKey}
        </span>
      ) : isDraggingField ? (
        <span className="text-[10px] text-[#6366f1] animate-pulse shrink-0">ドロップ</span>
      ) : (selectedFieldId !== null) ? (
        <span className="text-[10px] text-[#6366f1] shrink-0">接続</span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 italic shrink-0">未バインド</span>
      )}
    </button>
  )
})
