/**
 * ElementGroupBlock — Collapsible group of bindable template elements.
 *
 * Each element shows its type icon, name, and current binding status.
 * Supports click-to-connect and drag-to-connect (pointer up).
 */

import { memo, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BindableElement, FieldItem } from '../types'

interface ElementGroupBlockProps {
  readonly pageId: string
  readonly pageLabel: string
  readonly elements: readonly BindableElement[]
  readonly expanded: boolean
  readonly selectedFieldId: string | null
  readonly isDragging: boolean
  readonly fieldMap: ReadonlyMap<string, FieldItem>
  readonly onToggle: (pageId: string) => void
  readonly onConnect: (pageId: string, elementId: string) => void
  readonly onDisconnect: (pageId: string, elementId: string) => void
  readonly onPointerUp: (pageId: string, elementId: string) => void
  readonly onNavigate: (pageId: string, elementId: string) => void
  readonly elementRef: (elementId: string, el: HTMLElement | null) => void
}

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  dataField: { icon: '⬡', color: 'text-blue-500' },
  text: { icon: 'T', color: 'text-muted-foreground' },
  checkbox: { icon: '✓', color: 'text-purple-500' },
  eraSelect: { icon: '元', color: 'text-purple-500' },
}

export const ElementGroupBlock = memo(function ElementGroupBlock({
  pageId,
  pageLabel,
  elements,
  expanded,
  selectedFieldId,
  isDragging,
  fieldMap,
  onToggle,
  onConnect,
  onDisconnect,
  onPointerUp,
  onNavigate,
  elementRef,
}: ElementGroupBlockProps) {
  const handleToggle = useCallback(() => onToggle(pageId), [onToggle, pageId])

  return (
    <div className="border-b last:border-b-0">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-1 px-3 py-1.5 bg-muted/20 text-[10px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
        onClick={handleToggle}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 shrink-0" />
          : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="truncate">{pageLabel}</span>
        <span className="ml-auto text-[9px] opacity-60">
          {elements.filter((e) => e.boundFieldId).length}/{elements.length}
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
  const typeInfo = TYPE_ICONS[element.elementType] ?? TYPE_ICONS.text

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
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b last:border-b-0 transition-colors',
        isConnectedToSelected && 'bg-primary/5',
        (selectedFieldId !== null || isDragging) && 'hover:bg-primary/10 cursor-pointer',
        selectedFieldId === null && !isDragging && element.boundFieldId && 'hover:bg-destructive/10',
        selectedFieldId === null && !isDragging && !element.boundFieldId && 'hover:bg-accent opacity-60',
      )}
      onClick={handleClick}
      onPointerUp={() => onPointerUp(element.pageId, element.elementId)}
      onDoubleClick={() => onNavigate(element.pageId, element.elementId)}
      title="ダブルクリックでキャンバスに移動"
    >
      <span className={cn('text-[10px] shrink-0', typeInfo.color)}>
        {typeInfo.icon}
      </span>
      <span className="flex-1 truncate">{element.elementLabel}</span>
      {boundField ? (
        <span className="text-[10px] font-mono text-primary shrink-0 max-w-[40%] truncate">
          ← {boundField.fieldKey}
        </span>
      ) : (selectedFieldId !== null || isDragging) ? (
        <span className="text-[10px] text-muted-foreground shrink-0">接続</span>
      ) : null}
    </button>
  )
})
