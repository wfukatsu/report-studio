/**
 * useBindingState — core derivation + action logic of the BindingEditor.
 *
 * Uses the real Zustand store (reset per test) so that derived structures
 * (allElements / elementGroups / connections / bulkItems) are validated
 * against the actual store actions they wrap.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReportStore } from '@/store'
import { SYSTEM_GROUP_PRODUCT_MASTER } from '@/store/schemaSlice'
import { useBindingState } from './useBindingState'
import type { ReportElement } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let elementSeq = 0

function makeElement(overrides: Partial<Record<string, unknown>> = {}): ReportElement {
  elementSeq += 1
  return {
    id: `el-${elementSeq}`,
    type: 'dataField',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 10 },
    zIndex: elementSeq,
    visible: true,
    locked: false,
    fieldKey: '',
    style: {},
    ...overrides,
  } as unknown as ReportElement
}

function addElementToPage(el: ReportElement): string {
  const pageId = useReportStore.getState().definition.pages[0].id
  useReportStore.getState().addElement(pageId, el)
  return pageId
}

/** Create a schema group with fields, returns { groupId, fieldIds } */
function addGroupWithFields(
  role: 'master' | 'detail',
  fields: readonly { key: string; label?: string }[],
): { groupId: string; fieldIds: string[] } {
  const store = useReportStore.getState()
  store.addSchemaGroup(role)
  const groups = useReportStore.getState().definition.schema!.groups
  const groupId = groups[groups.length - 1].id
  for (const f of fields) {
    useReportStore.getState().addSchemaField(groupId, { key: f.key, label: f.label ?? '', type: 'string' })
  }
  const group = useReportStore.getState().definition.schema!.groups.find((g) => g.id === groupId)!
  return { groupId, fieldIds: group.fields.map((f) => f.id) }
}

function getElement(pageId: string, elementId: string): ReportElement | undefined {
  return useReportStore.getState().definition.pages
    .find((p) => p.id === pageId)?.sections
    ?.flatMap((s) => s.elements)
    .find((e) => e.id === elementId)
}

/** Minimal fake React.PointerEvent for drag handlers */
function pointerEvent(x: number, y: number): React.PointerEvent {
  return {
    clientX: x,
    clientY: y,
    pointerId: 1,
    currentTarget: { setPointerCapture: vi.fn() },
  } as unknown as React.PointerEvent
}

beforeEach(() => {
  useReportStore.getState().newReport()
})

// ---------------------------------------------------------------------------
// Derived: schema groups / fields
// ---------------------------------------------------------------------------

describe('useBindingState — schema derivation', () => {
  it('excludes system groups (product master) from schemaGroups and allFields', () => {
    addGroupWithFields('master', [{ key: 'customerName' }])
    useReportStore.getState().ensureProductMasterGroup()
    expect(useReportStore.getState().definition.schema!.groups.some((g) => g.id === SYSTEM_GROUP_PRODUCT_MASTER)).toBe(true)

    const { result } = renderHook(() => useBindingState())
    expect(result.current.schemaGroups).toHaveLength(1)
    expect(result.current.schemaGroups.some((g) => g.id === SYSTEM_GROUP_PRODUCT_MASTER)).toBe(false)
    expect(result.current.allFields.every((f) => f.fieldKey === 'customerName')).toBe(true)
  })

  it('flattens fields across groups and falls back to key when label is empty', () => {
    const g1 = addGroupWithFields('master', [{ key: 'name', label: '顧客名' }])
    const g2 = addGroupWithFields('detail', [{ key: 'qty' }])

    const { result } = renderHook(() => useBindingState())
    expect(result.current.allFields).toHaveLength(2)
    const [f1, f2] = result.current.allFields
    expect(f1).toMatchObject({ fieldKey: 'name', fieldLabel: '顧客名', groupId: g1.groupId })
    expect(f2).toMatchObject({ fieldKey: 'qty', fieldLabel: 'qty', groupId: g2.groupId })
    // fieldMap indexes every field by id
    expect(result.current.fieldMap.get(g1.fieldIds[0])?.fieldKey).toBe('name')
  })

  it('reports hasSchema / hasFields / hasPhysicalSchema flags progressively', () => {
    const { result } = renderHook(() => useBindingState())
    expect(result.current.hasSchema).toBe(false)
    expect(result.current.hasFields).toBe(false)
    expect(result.current.hasPhysicalSchema).toBe(false)

    act(() => { useReportStore.getState().addSchemaGroup('master') })
    expect(result.current.hasSchema).toBe(true)
    expect(result.current.hasFields).toBe(false)

    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    act(() => { useReportStore.getState().addSchemaField(groupId, { key: 'a', label: '', type: 'string' }) })
    expect(result.current.hasFields).toBe(true)
    expect(result.current.hasPhysicalSchema).toBe(false)

    act(() => {
      useReportStore.getState().bindGroupToTable(groupId, {
        namespace: 'ns', tableName: 'customers', partitionKeys: [], clusteringKeys: [], columns: [],
      } as never)
    })
    expect(result.current.hasPhysicalSchema).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Derived: elements
// ---------------------------------------------------------------------------

describe('useBindingState — element derivation', () => {
  it('lists only bindable element types', () => {
    addElementToPage(makeElement({ type: 'dataField', name: '金額' }))
    addElementToPage(makeElement({ type: 'text', name: 'タイトル' }))
    addElementToPage(makeElement({ type: 'shape', name: '枠線' }))

    const { result } = renderHook(() => useBindingState())
    expect(result.current.allElements).toHaveLength(2)
    expect(result.current.allElements.map((e) => e.elementType).sort()).toEqual(['dataField', 'text'])
  })

  it('falls back to element type as label when name is empty', () => {
    addElementToPage(makeElement({ type: 'dataField', name: '  ' }))
    const { result } = renderHook(() => useBindingState())
    expect(result.current.allElements[0].elementLabel).toBe('dataField')
  })

  it('detects elements geometrically inside a repeatingBand and tags them with the container dataSource', () => {
    addElementToPage(makeElement({
      id: 'band-1', type: 'repeatingBand', dataSource: 'items',
      position: { x: 0, y: 100 }, size: { width: 200, height: 60 },
    }))
    addElementToPage(makeElement({
      id: 'inside', type: 'dataField', name: '数量',
      position: { x: 10, y: 110 }, size: { width: 50, height: 10 },
    }))
    addElementToPage(makeElement({
      id: 'outside', type: 'dataField', name: '顧客名',
      position: { x: 10, y: 10 }, size: { width: 50, height: 10 },
    }))

    const { result } = renderHook(() => useBindingState())
    const inside = result.current.allElements.find((e) => e.elementId === 'inside')!
    const outside = result.current.allElements.find((e) => e.elementId === 'outside')!
    expect(inside.repeatContainerId).toBe('band-1')
    expect(inside.repeatDataSource).toBe('items')
    expect(outside.repeatContainerId).toBeUndefined()
    expect(outside.repeatDataSource).toBeUndefined()
    // The band itself is not a bindable element
    expect(result.current.allElements.some((e) => e.elementId === 'band-1')).toBe(false)
  })

  it('groups bound elements into schema-group sub-groups and unbound into 未バインド', () => {
    const { groupId, fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'bound-el', name: '顧客名欄' }))
    addElementToPage(makeElement({ id: 'free-el', name: '備考欄' }))
    useReportStore.getState().setElementSchemaBinding(pageId, 'bound-el', fieldIds[0])

    const { result } = renderHook(() => useBindingState())
    expect(result.current.elementGroups).toHaveLength(1)
    const [pageGroup] = result.current.elementGroups
    expect(pageGroup.subGroups).toHaveLength(2)

    const masterSub = pageGroup.subGroups[0]
    expect(masterSub.role).toBe('master')
    expect(masterSub.schemaGroupId).toBe(groupId)
    expect(masterSub.dataSource).toBeUndefined()
    expect(masterSub.elements.map((e) => e.elementId)).toEqual(['bound-el'])

    const unboundSub = pageGroup.subGroups[1]
    expect(unboundSub.role).toBe('single')
    expect(unboundSub.label).toBe('未バインド')
    expect(unboundSub.elements.map((e) => e.elementId)).toEqual(['free-el'])
  })

  it('marks detail-group sub-groups as repeat with the group dataKey as dataSource', () => {
    const { groupId, fieldIds } = addGroupWithFields('detail', [{ key: 'qty' }])
    useReportStore.getState().updateSchemaGroup(groupId, { dataKey: 'items' })
    const pageId = addElementToPage(makeElement({ id: 'qty-el', name: '数量' }))
    useReportStore.getState().setElementSchemaBinding(pageId, 'qty-el', fieldIds[0])

    const { result } = renderHook(() => useBindingState())
    const sub = result.current.elementGroups[0].subGroups[0]
    expect(sub.role).toBe('repeat')
    expect(sub.dataSource).toBe('items')
  })

  it('omits pages that contain no bindable elements', () => {
    const { result } = renderHook(() => useBindingState())
    expect(result.current.elementGroups).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Derived: connections & statistics
// ---------------------------------------------------------------------------

describe('useBindingState — connections and statistics', () => {
  it('derives connections with groupId, per-field bound counts and totals', () => {
    const { groupId, fieldIds } = addGroupWithFields('master', [{ key: 'name' }, { key: 'addr' }])
    const pageId = addElementToPage(makeElement({ id: 'e1' }))
    addElementToPage(makeElement({ id: 'e2' }))
    addElementToPage(makeElement({ id: 'e3' }))
    // name bound to two elements, addr unbound
    useReportStore.getState().setElementSchemaBinding(pageId, 'e1', fieldIds[0])
    useReportStore.getState().setElementSchemaBinding(pageId, 'e2', fieldIds[0])

    const { result } = renderHook(() => useBindingState())
    expect(result.current.connections).toHaveLength(2)
    expect(result.current.connections.every((c) => c.fieldId === fieldIds[0] && c.groupId === groupId)).toBe(true)
    expect(result.current.fieldBoundCount.get(fieldIds[0])).toBe(2)
    expect(result.current.fieldBoundCount.has(fieldIds[1])).toBe(false)
    expect(result.current.boundFieldIds.has(fieldIds[0])).toBe(true)
    expect(result.current.boundFieldIds.has(fieldIds[1])).toBe(false)
    expect(result.current.totalElements).toBe(3)
    expect(result.current.boundElements).toBe(2)
    expect(result.current.unboundElements).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Actions: selection / connect / disconnect
// ---------------------------------------------------------------------------

describe('useBindingState — selection and connect/disconnect', () => {
  it('toggles field selection on repeated select, and clearSelection resets it', () => {
    const { result } = renderHook(() => useBindingState())

    act(() => result.current.handleFieldSelect('f-1'))
    expect(result.current.selectedFieldId).toBe('f-1')

    act(() => result.current.handleFieldSelect('f-1'))
    expect(result.current.selectedFieldId).toBeNull()

    act(() => result.current.handleFieldSelect('f-2'))
    act(() => result.current.clearSelection())
    expect(result.current.selectedFieldId).toBeNull()
  })

  it('connect binds the selected field to the element via the store', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'e1' }))

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.handleFieldSelect(fieldIds[0]))
    act(() => result.current.connect(pageId, 'e1'))

    expect(getElement(pageId, 'e1')?.schemaBinding?.fieldId).toBe(fieldIds[0])
  })

  it('connect with an explicit fieldId does not require a selection', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'e1' }))

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.connect(pageId, 'e1', fieldIds[0]))
    expect(getElement(pageId, 'e1')?.schemaBinding?.fieldId).toBe(fieldIds[0])
  })

  it('connect is a no-op when nothing is selected', () => {
    const pageId = addElementToPage(makeElement({ id: 'e1' }))
    const { result } = renderHook(() => useBindingState())
    act(() => result.current.connect(pageId, 'e1'))
    expect(getElement(pageId, 'e1')?.schemaBinding).toBeUndefined()
  })

  it('disconnect removes an existing binding', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'e1' }))
    useReportStore.getState().setElementSchemaBinding(pageId, 'e1', fieldIds[0])

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.disconnect(pageId, 'e1'))
    expect(getElement(pageId, 'e1')?.schemaBinding).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Actions: drag-to-connect (bidirectional)
// ---------------------------------------------------------------------------

describe('useBindingState — drag-to-connect', () => {
  it('field drag → drop on element creates the binding and resets drag state', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'e1' }))

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.handleFieldDragStart(pointerEvent(10, 20), fieldIds[0]))
    expect(result.current.isDraggingField).toBe(true)
    expect(result.current.isDraggingElement).toBe(false)

    act(() => result.current.handleDragMove(pointerEvent(120, 80)))
    expect(result.current.dragState).toMatchObject({ startX: 10, startY: 20, currentX: 120, currentY: 80 })

    act(() => result.current.handleDropOnElement(pageId, 'e1'))
    expect(getElement(pageId, 'e1')?.schemaBinding?.fieldId).toBe(fieldIds[0])
    expect(result.current.dragState).toBeNull()
    expect(result.current.selectedFieldId).toBeNull()
  })

  it('element drag → drop on field creates the binding (reverse direction)', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'e1', name: '顧客名欄' }))

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.handleElementDragStart(pointerEvent(5, 5), pageId, 'e1', '顧客名欄'))
    expect(result.current.isDraggingElement).toBe(true)

    act(() => result.current.handleDropOnField(fieldIds[0]))
    expect(getElement(pageId, 'e1')?.schemaBinding?.fieldId).toBe(fieldIds[0])
    expect(result.current.dragState).toBeNull()
  })

  it('drop handlers ignore the wrong drag direction', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    const pageId = addElementToPage(makeElement({ id: 'e1' }))

    const { result } = renderHook(() => useBindingState())
    // Dragging an element: dropping on another *element* must not bind
    act(() => result.current.handleElementDragStart(pointerEvent(0, 0), pageId, 'e1', 'x'))
    act(() => result.current.handleDropOnElement(pageId, 'e1'))
    expect(getElement(pageId, 'e1')?.schemaBinding).toBeUndefined()

    // Dragging a field: dropping on a *field* must not bind
    act(() => result.current.handleContainerPointerUp())
    act(() => result.current.handleFieldDragStart(pointerEvent(0, 0), fieldIds[0]))
    act(() => result.current.handleDropOnField(fieldIds[0]))
    expect(getElement(pageId, 'e1')?.schemaBinding).toBeUndefined()
  })

  it('pointer-up on empty container cancels the drag without binding', () => {
    const { fieldIds } = addGroupWithFields('master', [{ key: 'name' }])
    addElementToPage(makeElement({ id: 'e1' }))

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.handleFieldDragStart(pointerEvent(0, 0), fieldIds[0]))
    act(() => result.current.handleContainerPointerUp())
    expect(result.current.dragState).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Actions: navigation
// ---------------------------------------------------------------------------

describe('useBindingState — navigateToElement', () => {
  it('activates the page and selects the element in the canvas', () => {
    const pageId = addElementToPage(makeElement({ id: 'e1' }))
    const { result } = renderHook(() => useBindingState())

    act(() => result.current.navigateToElement(pageId, 'e1'))
    const selection = useReportStore.getState().selection
    expect(selection.activePageId).toBe(pageId)
    expect(selection.selectedElementIds).toEqual(['e1'])
  })
})

// ---------------------------------------------------------------------------
// Bulk generation
// ---------------------------------------------------------------------------

describe('useBindingState — bulk generation', () => {
  it('side=template: proposes schema fields for element labels not yet present as keys', () => {
    const { groupId } = addGroupWithFields('master', [{ key: 'existing' }])
    addElementToPage(makeElement({ id: 'e1', name: 'Customer Name' }))
    addElementToPage(makeElement({ id: 'e2', name: 'existing' })) // label collides with key → skipped

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.setBulk({ side: 'template', groupId }))

    expect(result.current.bulkItems).toEqual([{ name: 'Customer Name', type: 'string' }])
  })

  it('side=template: runBulk creates schema fields with sanitized keys and clears the request', () => {
    const { groupId } = addGroupWithFields('master', [])
    addElementToPage(makeElement({ id: 'e1', name: 'Customer Name' }))

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.setBulk({ side: 'template', groupId }))
    act(() => result.current.runBulk())

    const group = useReportStore.getState().definition.schema!.groups.find((g) => g.id === groupId)!
    expect(group.fields).toHaveLength(1)
    expect(group.fields[0]).toMatchObject({ key: 'Customer_Name', label: 'Customer Name', type: 'string' })
    expect(result.current.bulk).toBeNull()
  })

  it('side=schema: proposes elements for fields whose label does not match an existing element', () => {
    const { groupId } = addGroupWithFields('master', [
      { key: 'name', label: '顧客名' },
      { key: 'memo', label: '備考' },
    ])
    addElementToPage(makeElement({ id: 'e1', name: '顧客名' })) // matches field label → skipped

    const { result } = renderHook(() => useBindingState())
    act(() => result.current.setBulk({ side: 'schema', groupId }))
    expect(result.current.bulkItems).toEqual([{ name: '備考', type: 'string' }])
  })

  it('returns no bulk items when the group does not exist', () => {
    addElementToPage(makeElement({ id: 'e1', name: 'x' }))
    const { result } = renderHook(() => useBindingState())
    act(() => result.current.setBulk({ side: 'template', groupId: 'no-such-group' }))
    expect(result.current.bulkItems).toEqual([])
  })
})
