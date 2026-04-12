/**
 * Phase 3A + Phase 4: Visual Mapper tab for DataBindingModal.
 *
 * Provides two complementary connection modes:
 * 1. Click-to-connect: click a field chip → click an element row → connect
 * 2. Drag-to-connect (Phase 4): pointer-drag from field chip → drop on element row
 *
 * SVG overlay shows:
 * - Dashed lines for existing connections
 * - Rubber-band line while dragging
 */
import { useCallback, useRef, useState } from 'react'
import { useReportStore } from '@/store'
import { flattenPageElements } from '@/store/selectors'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldItem {
  fieldId: string
  fieldKey: string
  fieldLabel: string
  groupId: string
  groupLabel: string
  dbColumnName?: string
}

interface ElementItem {
  pageId: string
  elementId: string
  elementLabel: string
  elementType: string
  /** Currently bound fieldId (from schemaBinding) */
  boundFieldId?: string
}

interface DragState {
  fieldId: string
  startX: number
  startY: number
  currentX: number
  currentY: number
}

// Element types that support schemaBinding
const BINDABLE_TYPES = new Set(['dataField', 'text', 'checkbox', 'eraSelect'])

// ---------------------------------------------------------------------------
// SVG connection overlay
// ---------------------------------------------------------------------------

interface ConnectionOverlayProps {
  connections: { fieldId: string; elementId: string }[]
  dragState: DragState | null
  fieldRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>
  elementRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>
  containerRef: React.RefObject<HTMLDivElement | null>
}

function ConnectionOverlay({
  connections,
  dragState,
  fieldRefs,
  elementRefs,
  containerRef,
}: ConnectionOverlayProps) {
  const containerRect = containerRef.current?.getBoundingClientRect()

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ zIndex: 10 }}
      aria-hidden="true"
    >
      {/* Existing connection lines */}
      {containerRect && connections.map(({ fieldId, elementId }) => {
        const fieldEl = fieldRefs.current.get(fieldId)
        const elementEl = elementRefs.current.get(elementId)
        if (!fieldEl || !elementEl) return null
        const fieldRect = fieldEl.getBoundingClientRect()
        const elementRect = elementEl.getBoundingClientRect()
        return (
          <line
            key={`${fieldId}-${elementId}`}
            x1={fieldRect.right - containerRect.left}
            y1={fieldRect.top + fieldRect.height / 2 - containerRect.top}
            x2={elementRect.left - containerRect.left}
            y2={elementRect.top + elementRect.height / 2 - containerRect.top}
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={0.6}
          />
        )
      })}

      {/* Drag rubber-band line */}
      {dragState && containerRect && (() => {
        const dragFieldEl = fieldRefs.current.get(dragState.fieldId)
        if (!dragFieldEl) return null
        const fieldRect = dragFieldEl.getBoundingClientRect()
        return (
          <line
            data-drag="true"
            x1={fieldRect.right - containerRect.left}
            y1={fieldRect.top + fieldRect.height / 2 - containerRect.top}
            x2={dragState.currentX - containerRect.left}
            y2={dragState.currentY - containerRect.top}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeDasharray="6 3"
            opacity={0.8}
          />
        )
      })()}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldChipProps {
  field: FieldItem
  isSelected: boolean
  boundElementCount: number
  onSelect: (fieldId: string) => void
  onPointerDown: (e: React.PointerEvent, fieldId: string) => void
  onPointerMove: (e: React.PointerEvent, fieldId: string) => void
  chipRef: (el: HTMLButtonElement | null) => void
}

function FieldChip({
  field,
  isSelected,
  boundElementCount,
  onSelect,
  onPointerDown,
  onPointerMove,
  chipRef,
}: FieldChipProps) {
  return (
    <button
      ref={chipRef}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b last:border-b-0 transition-colors select-none',
        isSelected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-accent',
      )}
      onClick={() => onSelect(field.fieldId)}
      onPointerDown={(e) => onPointerDown(e, field.fieldId)}
      onPointerMove={(e) => onPointerMove(e, field.fieldId)}
      title={field.dbColumnName ? `DB: ${field.dbColumnName}` : undefined}
    >
      <span className="flex-1 truncate font-medium">{field.fieldLabel}</span>
      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[35%]">
        {field.fieldKey}
      </span>
      {boundElementCount > 0 && (
        <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 shrink-0">
          {boundElementCount}
        </span>
      )}
    </button>
  )
}

interface ElementRowProps {
  element: ElementItem
  selectedFieldId: string | null
  isDragging: boolean
  allFields: FieldItem[]
  onConnect: (pageId: string, elementId: string) => void
  onDisconnect: (pageId: string, elementId: string) => void
  onPointerUp: (pageId: string, elementId: string) => void
  rowRef: (el: HTMLButtonElement | null) => void
}

function ElementRow({
  element,
  selectedFieldId,
  isDragging,
  allFields,
  onConnect,
  onDisconnect,
  onPointerUp,
  rowRef,
}: ElementRowProps) {
  const boundField = element.boundFieldId
    ? allFields.find((f) => f.fieldId === element.boundFieldId)
    : null

  const isConnectedToSelected = selectedFieldId !== null && element.boundFieldId === selectedFieldId

  function handleClick() {
    if (isDragging) return  // Don't process click during drag
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
      ref={rowRef}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b last:border-b-0 transition-colors',
        isConnectedToSelected && 'bg-primary/5',
        (selectedFieldId !== null || isDragging) && 'hover:bg-primary/10 cursor-pointer',
        selectedFieldId === null && !isDragging && element.boundFieldId && 'hover:bg-destructive/10',
        selectedFieldId === null && !isDragging && !element.boundFieldId && 'hover:bg-accent opacity-60',
      )}
      onClick={handleClick}
      onPointerUp={() => onPointerUp(element.pageId, element.elementId)}
    >
      <span className={cn('text-[10px] shrink-0', {
        'text-muted-foreground': element.elementType === 'text',
        'text-blue-500': element.elementType === 'dataField',
        'text-purple-500': element.elementType === 'checkbox' || element.elementType === 'eraSelect',
      })}>
        {element.elementType === 'dataField' ? '⬡' : element.elementType === 'text' ? 'T' : '✓'}
      </span>
      <span className="flex-1 truncate">{element.elementLabel}</span>
      {boundField ? (
        <span className="text-[10px] font-mono text-primary shrink-0 max-w-[40%] truncate">
          ← {boundField.fieldKey}
        </span>
      ) : (selectedFieldId !== null || isDragging) ? (
        <span className="text-[10px] text-muted-foreground shrink-0">ドロップで接続</span>
      ) : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BindingMapperTab({ onClose }: { onClose?: () => void } = {}) {
  const schema = useReportStore((s) => s.definition.schema)
  const pages = useReportStore((s) => s.definition.pages)
  const setElementSchemaBinding = useReportStore((s) => s.setElementSchemaBinding)
  const setActivePage = useReportStore((s) => s.setActivePage)
  const selectElement = useReportStore((s) => s.selectElement)

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  // Refs for SVG connection lines
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fieldRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())
  const elementRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())

  // Build flat list of all schema fields
  const allFields: FieldItem[] = (schema?.groups ?? []).flatMap((group) =>
    group.fields.map((field) => ({
      fieldId: field.id,
      fieldKey: field.key,
      fieldLabel: field.label || field.key,
      groupId: group.id,
      groupLabel: group.label || group.id,
      dbColumnName: field.dbColumnName,
    })),
  )

  // Build flat list of all bindable elements across all pages
  const allElements: ElementItem[] = pages.flatMap((page) =>
    flattenPageElements(page)
      .filter((el) => BINDABLE_TYPES.has(el.type))
      .map((el) => ({
        pageId: page.id,
        elementId: el.id,
        elementLabel: el.name?.trim() || el.type,
        elementType: el.type,
        boundFieldId: el.schemaBinding?.fieldId,
      })),
  )

  // Count how many elements each field is bound to
  const fieldBoundCount = new Map<string, number>()
  for (const el of allElements) {
    if (el.boundFieldId) {
      fieldBoundCount.set(el.boundFieldId, (fieldBoundCount.get(el.boundFieldId) ?? 0) + 1)
    }
  }

  // Build connections list for SVG overlay
  const connections = allElements
    .filter((el) => el.boundFieldId)
    .map((el) => ({ fieldId: el.boundFieldId!, elementId: el.elementId }))

  // ---------------------------------------------------------------------------
  // Click-connect handlers (Phase 3A — kept as fallback)
  // ---------------------------------------------------------------------------

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId((prev) => prev === fieldId ? null : fieldId)
  }, [])

  const handleConnect = useCallback((pageId: string, elementId: string) => {
    if (!selectedFieldId) return
    setElementSchemaBinding(pageId, elementId, selectedFieldId)
  }, [selectedFieldId, setElementSchemaBinding])

  const handleDisconnect = useCallback((pageId: string, elementId: string) => {
    setElementSchemaBinding(pageId, elementId, undefined)
  }, [setElementSchemaBinding])

  const handleElementNavigate = useCallback((pageId: string, elementId: string) => {
    setActivePage(pageId)
    selectElement(elementId)
  }, [setActivePage, selectElement])

  // ---------------------------------------------------------------------------
  // Drag-connect handlers (Phase 4)
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback((e: React.PointerEvent, fieldId: string) => {
    // setPointerCapture may not be available in all environments (e.g. jsdom)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
    setDragState({
      fieldId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    })
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent, fieldId: string) => {
    setDragState((prev) => {
      if (!prev || prev.fieldId !== fieldId) return prev
      return { ...prev, currentX: e.clientX, currentY: e.clientY }
    })
  }, [])

  const handleElementPointerUp = useCallback((pageId: string, elementId: string) => {
    if (!dragState) return
    setElementSchemaBinding(pageId, elementId, dragState.fieldId)
    setDragState(null)
    setSelectedFieldId(null)
  }, [dragState, setElementSchemaBinding])

  // Cancel drag on pointerup on container (not on an element)
  const handleContainerPointerUp = useCallback(() => {
    if (dragState) {
      setDragState(null)
    }
  }, [dragState])

  if (!schema || schema.groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-xs text-muted-foreground p-8 text-center">
        <p>スキーマが未定義です。</p>
        <p>スキーマタブでグループとフィールドを追加すると、要素とのバインドが設定できます。</p>
        {onClose && (
          <button
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            onClick={onClose}
          >
            閉じてスキーマを設定する →
          </button>
        )}
      </div>
    )
  }

  const boundElementCount = allElements.filter((e) => e.boundFieldId).length
  const isDragging = dragState !== null

  return (
    <div
      ref={containerRef}
      className="flex h-full overflow-hidden relative"
      onPointerUp={handleContainerPointerUp}
    >
      {/* SVG overlay for connection lines */}
      <ConnectionOverlay
        connections={connections}
        dragState={dragState}
        fieldRefs={fieldRefs}
        elementRefs={elementRefs}
        containerRef={containerRef}
      />

      {/* Left panel: Schema fields */}
      <div className="w-1/2 border-r overflow-y-auto flex flex-col">
        <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            スキーマフィールド
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            フィールドをクリックまたはドラッグして接続
          </p>
        </div>

        {(schema.groups ?? []).map((group) => (
          <div key={group.id}>
            <div className="px-3 py-1 bg-muted/20 border-b">
              <span className="text-[10px] font-medium text-muted-foreground">
                {group.label || group.id}
                <span className="ml-1 opacity-60">({group.role})</span>
              </span>
            </div>
            {group.fields.length === 0 ? (
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-b">
                フィールドなし
              </div>
            ) : (
              group.fields.map((field) => (
                <FieldChip
                  key={field.id}
                  field={{
                    fieldId: field.id,
                    fieldKey: field.key,
                    fieldLabel: field.label || field.key,
                    groupId: group.id,
                    groupLabel: group.label || group.id,
                    dbColumnName: field.dbColumnName,
                  }}
                  isSelected={selectedFieldId === field.id}
                  boundElementCount={fieldBoundCount.get(field.id) ?? 0}
                  onSelect={handleFieldSelect}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  chipRef={(el) => {
                    if (el) {
                      fieldRefs.current.set(field.id, el)
                    } else {
                      fieldRefs.current.delete(field.id)
                    }
                  }}
                />
              ))
            )}
          </div>
        ))}
      </div>

      {/* Right panel: Bindable elements */}
      <div className="w-1/2 overflow-y-auto flex flex-col">
        <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            レポート要素
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {isDragging
              ? '要素にドロップして接続'
              : selectedFieldId
              ? '要素をクリックして接続'
              : `${boundElementCount}/${allElements.length} 要素がバインド済み`}
          </p>
        </div>

        {allElements.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-muted-foreground italic">
            バインド可能な要素がありません
          </div>
        ) : (
          pages.map((page) => {
            const pageElements = allElements.filter((e) => e.pageId === page.id)
            if (pageElements.length === 0) return null
            return (
              <div key={page.id}>
                <div className="px-3 py-1 bg-muted/20 border-b flex items-center gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {page.name || 'ページ'}
                  </span>
                  <button
                    className="text-[10px] text-primary hover:underline ml-auto"
                    onClick={() => setActivePage(page.id)}
                  >
                    移動
                  </button>
                </div>
                {pageElements.map((el) => (
                  <ElementRow
                    key={el.elementId}
                    element={el}
                    selectedFieldId={selectedFieldId}
                    isDragging={isDragging}
                    allFields={allFields}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onPointerUp={handleElementPointerUp}
                    rowRef={(btn) => {
                      if (btn) {
                        elementRefs.current.set(el.elementId, btn)
                      } else {
                        elementRefs.current.delete(el.elementId)
                      }
                    }}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Status bar */}
      {selectedFieldId && !isDragging && (
        <div className="absolute bottom-0 left-0 right-0 bg-primary/10 border-t px-4 py-2 text-[10px] text-primary flex items-center gap-2">
          <span className="font-medium">
            選択中: {allFields.find((f) => f.fieldId === selectedFieldId)?.fieldKey ?? selectedFieldId}
          </span>
          <span>— 右パネルの要素をクリックして接続</span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedFieldId(null)}
          >
            ✕ 選択解除
          </button>
        </div>
      )}

      {/* Drag status indicator */}
      {isDragging && (
        <div className="absolute bottom-0 left-0 right-0 bg-primary/10 border-t px-4 py-2 text-[10px] text-primary flex items-center gap-2">
          <span className="font-medium">
            ドラッグ中: {allFields.find((f) => f.fieldId === dragState.fieldId)?.fieldKey ?? dragState.fieldId}
          </span>
          <span>— 右パネルの要素にドロップして接続</span>
        </div>
      )}
    </div>
  )
}
