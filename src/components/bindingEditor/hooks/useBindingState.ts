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
  ElementSubGroup,
  FieldItem,
  BindingConnection,
  DragState,
  BulkRequest,
  BulkItem,
} from '../types'
import { isBindableType } from '../types'
import { isSystemGroup } from '@/store/schemaSlice'
import { createDataFieldFromSchema } from '@/lib/elementFactories'
import type { ReportElement } from '@/types'

export function useBindingState() {
  // -----------------------------------------------------------------------
  // Store subscriptions
  // -----------------------------------------------------------------------
  const schema = useReportStore((s) => s.definition.schema)
  const pages = useReportStore((s) => s.definition.pages)
  const activePageId = useReportStore((s) => s.selection.activePageId)

  // Store actions
  const addElement = useReportStore((s) => s.addElement)
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
  // Derived: user-visible schema groups (exclude system groups)
  // -----------------------------------------------------------------------
  const userSchemaGroups = useMemo(() =>
    (schema?.groups ?? []).filter((g) => !isSystemGroup(g.id)),
    [schema?.groups],
  )

  // -----------------------------------------------------------------------
  // Derived: all schema fields (flat, from user groups only)
  // -----------------------------------------------------------------------
  const allFields: FieldItem[] = useMemo(() =>
    userSchemaGroups.flatMap((group) =>
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
    [userSchemaGroups],
  )

  // -----------------------------------------------------------------------
  // Derived: schema field path → fieldId. Lets the editor recognise the
  // fieldKey-based bindings that templates ship with (e.g. a dataField whose
  // `fieldKey` is "document.documentNo"), not just explicit `schemaBinding`.
  // -----------------------------------------------------------------------
  const fieldPathToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of userSchemaGroups) {
      for (const field of group.fields) {
        const path = group.dataKey ? `${group.dataKey}.${field.key}` : field.key
        if (path && !map.has(path)) map.set(path, field.id)
      }
    }
    return map
  }, [userSchemaGroups])

  // -----------------------------------------------------------------------
  // Derived: field lookup map (before elementGroups — needed for grouping)
  // -----------------------------------------------------------------------
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldItem>()
    for (const f of allFields) {
      map.set(f.fieldId, f)
    }
    return map
  }, [allFields])

  // -----------------------------------------------------------------------
  // Derived: all bindable elements with repeat container detection
  // -----------------------------------------------------------------------
  const allElements: BindableElement[] = useMemo(() => {
    const result: BindableElement[] = []
    for (const page of pages) {
      const allPageElements = flattenPageElements(page)
      // Build a map of repeat containers (repeatingBand / repeatingList)
      const repeatContainers = new Map<string, { id: string; dataSource: string; name: string }>()
      for (const el of allPageElements) {
        if (el.type === 'repeatingBand' || el.type === 'repeatingList') {
          repeatContainers.set(el.id, {
            id: el.id,
            dataSource: (el as ReportElement & { dataSource?: string }).dataSource ?? '',
            name: el.name?.trim() || el.type,
          })
        }
      }

      // Check if a bindable element is geometrically inside a repeat container
      for (const el of allPageElements) {
        if (!isBindableType(el.type)) continue
        // Find if this element is inside a repeat container (by position overlap)
        let container: { id: string; dataSource: string } | undefined
        for (const rc of allPageElements) {
          if (rc.type !== 'repeatingBand' && rc.type !== 'repeatingList') continue
          if (
            el.position.x >= rc.position.x &&
            el.position.y >= rc.position.y &&
            el.position.x + el.size.width <= rc.position.x + rc.size.width &&
            el.position.y + el.size.height <= rc.position.y + rc.size.height &&
            el.id !== rc.id
          ) {
            container = repeatContainers.get(rc.id)
            break
          }
        }

        // Prefer an explicit schemaBinding; otherwise fall back to matching the
        // element's fieldKey (what actually drives rendering) to a schema field.
        const fieldKey = (el as ReportElement & { fieldKey?: string }).fieldKey
        const boundFieldId = el.schemaBinding?.fieldId
          ?? (fieldKey ? fieldPathToId.get(fieldKey) : undefined)

        result.push({
          pageId: page.id,
          elementId: el.id,
          elementLabel: el.name?.trim() || el.type,
          elementType: el.type,
          boundFieldId,
          repeatContainerId: container?.id,
          repeatDataSource: container?.dataSource,
        })
      }
    }
    return result
  }, [pages, fieldPathToId])

  const elementGroups: ElementGroup[] = useMemo(() =>
    pages
      .map((page) => {
        const pageElements = allElements.filter((e) => e.pageId === page.id)

        // Group elements by their bound schema group
        const groupedBySchema = new Map<string, BindableElement[]>()
        const unboundElements: BindableElement[] = []

        for (const el of pageElements) {
          if (el.boundFieldId) {
            const field = fieldMap.get(el.boundFieldId)
            if (field) {
              const arr = groupedBySchema.get(field.groupId) ?? []
              arr.push(el)
              groupedBySchema.set(field.groupId, arr)
              continue
            }
          }
          unboundElements.push(el)
        }

        // Build sub-groups: one per schema group + one for unbound
        const subGroups: ElementSubGroup[] = []

        // Schema-group sub-groups (ordered by schema group position)
        for (const schemaGroup of userSchemaGroups) {
          const elements = groupedBySchema.get(schemaGroup.id)
          if (!elements || elements.length === 0) continue
          const isDetail = schemaGroup.role === 'detail'
          subGroups.push({
            id: `${page.id}-sg-${schemaGroup.id}`,
            label: schemaGroup.label || schemaGroup.dataKey || schemaGroup.id,
            role: isDetail ? 'repeat' : 'master',
            dataSource: isDetail ? schemaGroup.dataKey : undefined,
            schemaGroupId: schemaGroup.id,
            elements,
          })
        }

        // Unbound elements sub-group
        if (unboundElements.length > 0) {
          subGroups.push({
            id: `${page.id}-unbound`,
            label: '未バインド',
            role: 'single',
            elements: unboundElements,
          })
        }

        return {
          pageId: page.id,
          pageLabel: page.name || 'ページ',
          subGroups,
          elements: pageElements,
        }
      })
      .filter((g) => g.elements.length > 0),
    [pages, allElements, userSchemaGroups, fieldMap],
  )

  // -----------------------------------------------------------------------
  // Derived: binding connections + counts
  // -----------------------------------------------------------------------
  const connections: BindingConnection[] = useMemo(() =>
    allElements
      .filter((el) => el.boundFieldId != null)
      .map((el) => {
        const field = allFields.find((f) => f.fieldId === el.boundFieldId)
        return {
          fieldId: el.boundFieldId!,
          elementId: el.elementId,
          groupId: field?.groupId ?? '',
        }
      }),
    [allElements, allFields],
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

  // fieldMap moved above elementGroups (needed for schema-group grouping)

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
  }, [bulk, schema?.groups, allElements])

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
  // Actions: drag-to-connect (bidirectional: field→element or element→field)
  // -----------------------------------------------------------------------

  /** Start dragging a field card */
  const handleFieldDragStart = useCallback((e: React.PointerEvent, fieldId: string) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
    setDragState({
      source: 'field',
      fieldId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    })
  }, [])

  /** Start dragging an element card */
  const handleElementDragStart = useCallback((e: React.PointerEvent, pageId: string, elementId: string, label: string) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
    setDragState({
      source: 'element',
      pageId,
      elementId,
      elementLabel: label,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    })
  }, [])

  /** Update drag position (works for both sources) */
  const handleDragMove = useCallback((e: React.PointerEvent) => {
    setDragState((prev) => {
      if (!prev) return prev
      return { ...prev, currentX: e.clientX, currentY: e.clientY }
    })
  }, [])

  /** Drop on an element card (when dragging a field) */
  const handleDropOnElement = useCallback(
    (pageId: string, elementId: string) => {
      if (!dragState || dragState.source !== 'field') return
      setElementSchemaBinding(pageId, elementId, dragState.fieldId)
      setDragState(null)
      setSelectedFieldId(null)
    },
    [dragState, setElementSchemaBinding],
  )

  /** Drop on a field card (when dragging an element) */
  const handleDropOnField = useCallback(
    (fieldId: string) => {
      if (!dragState || dragState.source !== 'element') return
      setElementSchemaBinding(dragState.pageId, dragState.elementId, fieldId)
      setDragState(null)
      setSelectedFieldId(null)
    },
    [dragState, setElementSchemaBinding],
  )

  /** Cancel drag on empty area */
  const handleContainerPointerUp = useCallback(() => {
    if (dragState) setDragState(null)
  }, [dragState])

  /** Whether currently dragging a field (for element drop targets) */
  const isDraggingField = dragState?.source === 'field'
  /** Whether currently dragging an element (for field drop targets) */
  const isDraggingElement = dragState?.source === 'element'

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
      // Items are schema fields → create dataField elements on the active page,
      // pre-bound to each field. No active page → nothing to place onto.
      if (!activePageId) return
      const existingNames = new Set(allElements.map((e) => e.elementLabel))
      const fieldsToPlace = group.fields.filter((f) => !existingNames.has(f.label || f.key))
      fieldsToPlace.forEach((f, i) => {
        const el = createDataFieldFromSchema({
          fieldId: f.id,
          fieldKey: f.key,
          fieldLabel: f.label || f.key,
        })
        // Stack vertically so newly generated fields don't fully overlap
        addElement(activePageId, { ...el, position: { x: 13, y: 13 + i * 10 } })
      })
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
  }, [bulk, bulkItems, schema?.groups, addSchemaField, addElement, activePageId, allElements])

  // -----------------------------------------------------------------------
  // Schema state flags (based on user groups only)
  // -----------------------------------------------------------------------
  const hasSchema = userSchemaGroups.length > 0
  const hasFields = userSchemaGroups.some((g) => g.fields.length > 0)
  const hasPhysicalSchema = userSchemaGroups.some((g) => g.tableMeta != null)

  // Group index map for color coding
  const groupIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    userSchemaGroups.forEach((g, i) => map.set(g.id, i))
    return map
  }, [userSchemaGroups])

  // Hovered connection state
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null)

  return {
    // Schema from store
    schema,
    schemaGroups: userSchemaGroups,
    hasSchema,
    hasFields,
    hasPhysicalSchema,
    groupIndexMap,

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

    // Drag-to-connect actions (bidirectional)
    isDraggingField,
    isDraggingElement,
    handleFieldDragStart,
    handleElementDragStart,
    handleDragMove,
    handleDropOnElement,
    handleDropOnField,
    handleContainerPointerUp,

    // Navigation
    navigateToElement,

    // Bulk generation actions
    setBulk,
    runBulk,

    // Hover state for connection highlighting
    hoveredGroupId,
    setHoveredGroupId,
    hoveredFieldId,
    setHoveredFieldId,

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
