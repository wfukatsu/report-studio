/**
 * useBindingState — Core state hook for the BindingEditor.
 *
 * Wraps Zustand store actions and derives display-ready data structures.
 * UI-local state (selection, drag, expansion) is managed here.
 */

import { useCallback, useMemo, useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import { flattenPageElements } from '@/store/selectors'
import type {
  BindableElement,
  ElementGroup,
  FieldItem,
  BindingConnection,
  DragState,
  BulkRequest,
  BulkItem,
} from '../types'
import { isBindableType } from '../types'

export function useBindingState() {
  // -----------------------------------------------------------------------
  // Store subscriptions
  // -----------------------------------------------------------------------
  const schema = useReportStore((s) => s.definition.schema)
  const pages = useReportStore((s) => s.definition.pages)

  // Store actions
  const addSchemaGroup = useReportStore((s) => s.addSchemaGroup)
  const removeSchemaGroup = useReportStore((s) => s.removeSchemaGroup)
  const updateSchemaGroup = useReportStore((s) => s.updateSchemaGroup)
  const addSchemaField = useReportStore((s) => s.addSchemaField)
  const removeSchemaField = useReportStore((s) => s.removeSchemaField)
  const updateSchemaField = useReportStore((s) => s.updateSchemaField)
  const bindGroupToTable = useReportStore((s) => s.bindGroupToTable)
  const setElementSchemaBinding = useReportStore((s) => s.setElementSchemaBinding)
  const setActivePage = useReportStore((s) => s.setActivePage)
  const selectElement = useReportStore((s) => s.selectElement)

  // -----------------------------------------------------------------------
  // UI-local state
  // -----------------------------------------------------------------------
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [bulk, setBulk] = useState<BulkRequest | null>(null)
  const [addingFieldGroupId, setAddingFieldGroupId] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Derived: all schema fields (flat)
  // -----------------------------------------------------------------------
  const allFields: FieldItem[] = useMemo(() =>
    (schema?.groups ?? []).flatMap((group) =>
      group.fields.map((field) => ({
        fieldId: field.id,
        fieldKey: field.key,
        fieldLabel: field.label || field.key,
        groupId: group.id,
        groupLabel: group.label || group.id,
        dbColumnName: field.dbColumnName,
        computed: field.computed,
        expression: field.expression,
      })),
    ),
    [schema?.groups],
  )

  // -----------------------------------------------------------------------
  // Derived: all bindable elements (flat + grouped by page)
  // -----------------------------------------------------------------------
  const allElements: BindableElement[] = useMemo(() =>
    pages.flatMap((page) =>
      flattenPageElements(page)
        .filter((el) => isBindableType(el.type))
        .map((el) => ({
          pageId: page.id,
          elementId: el.id,
          elementLabel: el.name?.trim() || el.type,
          elementType: el.type,
          boundFieldId: el.schemaBinding?.fieldId,
        })),
    ),
    [pages],
  )

  const elementGroups: ElementGroup[] = useMemo(() =>
    pages
      .map((page) => ({
        pageId: page.id,
        pageLabel: page.name || 'ページ',
        elements: allElements.filter((e) => e.pageId === page.id),
      }))
      .filter((g) => g.elements.length > 0),
    [pages, allElements],
  )

  // -----------------------------------------------------------------------
  // Derived: binding connections + counts
  // -----------------------------------------------------------------------
  const connections: BindingConnection[] = useMemo(() =>
    allElements
      .filter((el) => el.boundFieldId != null)
      .map((el) => ({ fieldId: el.boundFieldId!, elementId: el.elementId })),
    [allElements],
  )

  const fieldBoundCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const el of allElements) {
      if (el.boundFieldId) {
        map.set(el.boundFieldId, (map.get(el.boundFieldId) ?? 0) + 1)
      }
    }
    return map
  }, [allElements])

  const boundFieldIds = useMemo(
    () => new Set(connections.map((c) => c.fieldId)),
    [connections],
  )

  const totalElements = allElements.length
  const boundElements = allElements.filter((e) => e.boundFieldId).length
  const unboundElements = totalElements - boundElements

  // -----------------------------------------------------------------------
  // Derived: field lookup map
  // -----------------------------------------------------------------------
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldItem>()
    for (const f of allFields) {
      map.set(f.fieldId, f)
    }
    return map
  }, [allFields])

  // -----------------------------------------------------------------------
  // Derived: bulk generation items
  // -----------------------------------------------------------------------
  const bulkItems: BulkItem[] = useMemo(() => {
    if (!bulk) return []
    const group = schema?.groups.find((g) => g.id === bulk.groupId)
    if (!group) return []

    if (bulk.side === 'schema') {
      // Generate template elements from schema fields
      const existingNames = new Set(allElements.map((e) => e.elementLabel))
      return group.fields
        .filter((f) => !existingNames.has(f.label || f.key))
        .map((f) => ({ name: f.label || f.key, type: f.type }))
    }
    // Generate schema fields from template elements
    const existingKeys = new Set(group.fields.map((f) => f.key))
    return allElements
      .filter((e) => !existingKeys.has(e.elementLabel))
      .map((e) => ({ name: e.elementLabel, type: 'string' }))
  }, [bulk, schema?.groups, allElements, allFields])

  // -----------------------------------------------------------------------
  // Actions: field selection (click-to-connect)
  // -----------------------------------------------------------------------
  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId((prev) => (prev === fieldId ? null : fieldId))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedFieldId(null)
    setDragState(null)
  }, [])

  // -----------------------------------------------------------------------
  // Actions: connect / disconnect
  // -----------------------------------------------------------------------
  const connect = useCallback(
    (pageId: string, elementId: string, fieldId?: string) => {
      const fId = fieldId ?? selectedFieldId
      if (!fId) return
      setElementSchemaBinding(pageId, elementId, fId)
    },
    [selectedFieldId, setElementSchemaBinding],
  )

  const disconnect = useCallback(
    (pageId: string, elementId: string) => {
      setElementSchemaBinding(pageId, elementId, undefined)
    },
    [setElementSchemaBinding],
  )

  // -----------------------------------------------------------------------
  // Actions: drag-to-connect
  // -----------------------------------------------------------------------
  const handlePointerDown = useCallback((e: React.PointerEvent, fieldId: string) => {
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

  const handleElementPointerUp = useCallback(
    (pageId: string, elementId: string) => {
      if (!dragState) return
      setElementSchemaBinding(pageId, elementId, dragState.fieldId)
      setDragState(null)
      setSelectedFieldId(null)
    },
    [dragState, setElementSchemaBinding],
  )

  const handleContainerPointerUp = useCallback(() => {
    if (dragState) setDragState(null)
  }, [dragState])

  // -----------------------------------------------------------------------
  // Actions: navigate to element in canvas
  // -----------------------------------------------------------------------
  const navigateToElement = useCallback(
    (pageId: string, elementId: string) => {
      setActivePage(pageId)
      selectElement(elementId)
    },
    [setActivePage, selectElement],
  )

  // -----------------------------------------------------------------------
  // Actions: bulk generation
  // -----------------------------------------------------------------------
  const runBulk = useCallback(() => {
    if (!bulk || bulkItems.length === 0) return
    const group = schema?.groups.find((g) => g.id === bulk.groupId)
    if (!group) return

    if (bulk.side === 'schema') {
      // Items are schema fields → create template elements (not directly possible from store)
      // For now, this is a no-op placeholder; template element creation requires canvas integration
    } else {
      // Items are element names → create schema fields in the group
      for (const item of bulkItems) {
        addSchemaField(bulk.groupId, {
          key: item.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
          label: item.name,
          type: 'string',
        } as never)
      }
    }
    setBulk(null)
  }, [bulk, bulkItems, schema?.groups, addSchemaField])

  // -----------------------------------------------------------------------
  // Schema state flags
  // -----------------------------------------------------------------------
  const hasSchema = (schema?.groups ?? []).length > 0
  const hasFields = (schema?.groups ?? []).some((g) => g.fields.length > 0)
  const hasPhysicalSchema = (schema?.groups ?? []).some((g) => g.tableMeta != null)

  return {
    // Schema from store
    schema,
    schemaGroups: schema?.groups ?? [],
    hasSchema,
    hasFields,
    hasPhysicalSchema,

    // Derived display data
    allFields,
    allElements,
    elementGroups,
    connections,
    fieldBoundCount,
    boundFieldIds,
    fieldMap,

    // Statistics
    totalElements,
    boundElements,
    unboundElements,

    // UI state
    selectedFieldId,
    dragState,
    isDragging: dragState !== null,
    bulk,
    bulkItems,
    addingFieldGroupId,

    // Field selection actions
    handleFieldSelect,
    clearSelection,

    // Connect/disconnect actions
    connect,
    disconnect,

    // Drag-to-connect actions
    handlePointerDown,
    handlePointerMove,
    handleElementPointerUp,
    handleContainerPointerUp,

    // Navigation
    navigateToElement,

    // Bulk generation actions
    setBulk,
    runBulk,

    // Field adding mode
    setAddingFieldGroupId,

    // Store actions (pass-through)
    addSchemaGroup,
    removeSchemaGroup,
    updateSchemaGroup,
    addSchemaField,
    removeSchemaField,
    updateSchemaField,
    bindGroupToTable,
    setElementSchemaBinding,
  }
}

export type BindingState = ReturnType<typeof useBindingState>
