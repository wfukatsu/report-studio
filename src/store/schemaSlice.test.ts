import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReportStore } from './index'
import type { SchemaGroup, SchemaField, ScalarDbTableMeta } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
})

function getGroups(): SchemaGroup[] {
  return useReportStore.getState().definition.schema?.groups ?? []
}

// ---------------------------------------------------------------------------
// addSchemaGroup
// ---------------------------------------------------------------------------

describe('addSchemaGroup', () => {
  it('master グループを追加できる', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groups = getGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].role).toBe('master')
    expect(groups[0].label).toBe('マスター')
  })

  it('detail グループを追加できる', () => {
    useReportStore.getState().addSchemaGroup('detail')
    const groups = getGroups()
    expect(groups[0].role).toBe('detail')
    expect(groups[0].label).toBe('明細')
  })

  it('schema が未定義でも初期化される', () => {
    expect(useReportStore.getState().definition.schema).toBeUndefined()
    useReportStore.getState().addSchemaGroup('master')
    expect(useReportStore.getState().definition.schema).toBeDefined()
  })

  it('各グループにユニーク id が付与される', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().addSchemaGroup('detail')
    const [g1, g2] = getGroups()
    expect(g1.id).not.toBe(g2.id)
  })

  it('フィールドが空配列で初期化される', () => {
    useReportStore.getState().addSchemaGroup('master')
    expect(getGroups()[0].fields).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// removeSchemaGroup
// ---------------------------------------------------------------------------

describe('removeSchemaGroup', () => {
  it('指定 id のグループを削除する', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().addSchemaGroup('detail')
    const id = getGroups()[0].id
    useReportStore.getState().removeSchemaGroup(id)
    const groups = getGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].id).not.toBe(id)
  })

  it('schema が未定義のときは何もしない', () => {
    expect(() => useReportStore.getState().removeSchemaGroup('nonexistent')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// updateSchemaGroup
// ---------------------------------------------------------------------------

describe('updateSchemaGroup', () => {
  it('label を更新できる', () => {
    useReportStore.getState().addSchemaGroup('master')
    const id = getGroups()[0].id
    useReportStore.getState().updateSchemaGroup(id, { label: '顧客マスター' })
    expect(getGroups()[0].label).toBe('顧客マスター')
  })

  it('dataKey を更新できる', () => {
    useReportStore.getState().addSchemaGroup('detail')
    const id = getGroups()[0].id
    useReportStore.getState().updateSchemaGroup(id, { dataKey: 'items' })
    expect(getGroups()[0].dataKey).toBe('items')
  })

  it('存在しない id は無視する', () => {
    useReportStore.getState().addSchemaGroup('master')
    expect(() => useReportStore.getState().updateSchemaGroup('nonexistent', { label: 'X' })).not.toThrow()
    expect(getGroups()[0].label).toBe('マスター')
  })

  it('Phase 3.5: linkedMasterGroupId を設定できる', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().addSchemaGroup('detail')
    const [masterGroup, detailGroup] = getGroups()
    useReportStore.getState().updateSchemaGroup(detailGroup.id, { linkedMasterGroupId: masterGroup.id })
    expect(getGroups()[1].linkedMasterGroupId).toBe(masterGroup.id)
  })

  it('Phase 3.5: linkedMasterGroupId を undefined にクリアできる', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().addSchemaGroup('detail')
    const [masterGroup, detailGroup] = getGroups()
    useReportStore.getState().updateSchemaGroup(detailGroup.id, { linkedMasterGroupId: masterGroup.id })
    useReportStore.getState().updateSchemaGroup(detailGroup.id, { linkedMasterGroupId: undefined })
    expect(getGroups()[1].linkedMasterGroupId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// addSchemaField
// ---------------------------------------------------------------------------

describe('addSchemaField', () => {
  it('グループにフィールドを追加できる', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    const field: Omit<SchemaField, 'id'> = { key: 'name', label: '名前', type: 'string' }
    useReportStore.getState().addSchemaField(groupId, field as SchemaField)
    expect(getGroups()[0].fields).toHaveLength(1)
    expect(getGroups()[0].fields[0].key).toBe('name')
  })

  it('フィールドに新しい id が付与される', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'f1', label: '', type: 'string' } as SchemaField)
    useReportStore.getState().addSchemaField(groupId, { key: 'f2', label: '', type: 'string' } as SchemaField)
    const [f1, f2] = getGroups()[0].fields
    expect(f1.id).not.toBe(f2.id)
  })

  it('存在しない groupId は無視する', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().addSchemaField('nonexistent', { key: 'f1', label: '', type: 'string' } as SchemaField)
    expect(getGroups()[0].fields).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// removeSchemaField
// ---------------------------------------------------------------------------

describe('removeSchemaField', () => {
  function setup() {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'f1', label: 'F1', type: 'string' } as SchemaField)
    useReportStore.getState().addSchemaField(groupId, { key: 'f2', label: 'F2', type: 'number' } as SchemaField)
    return groupId
  }

  it('指定 id のフィールドを削除する', () => {
    const groupId = setup()
    const fieldId = getGroups()[0].fields[0].id
    useReportStore.getState().removeSchemaField(groupId, fieldId)
    expect(getGroups()[0].fields).toHaveLength(1)
    expect(getGroups()[0].fields[0].key).toBe('f2')
  })

  it('存在しない groupId は無視する', () => {
    setup()
    expect(() => useReportStore.getState().removeSchemaField('nonexistent', 'f1')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// updateSchemaField
// ---------------------------------------------------------------------------

describe('updateSchemaField', () => {
  it('フィールドの label を更新できる', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '名前', type: 'string' } as SchemaField)
    const fieldId = getGroups()[0].fields[0].id
    useReportStore.getState().updateSchemaField(groupId, fieldId, { label: '氏名' })
    expect(getGroups()[0].fields[0].label).toBe('氏名')
  })

  it('存在しないフィールド id は無視する', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '名前', type: 'string' } as SchemaField)
    expect(() => useReportStore.getState().updateSchemaField(groupId, 'nonexistent', { label: 'X' })).not.toThrow()
    expect(getGroups()[0].fields[0].label).toBe('名前')
  })
})

describe('setSchema', () => {
  it('replaces entire schema definition', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().setSchema({
      groups: [
        { id: 'g1', label: 'New', role: 'master', dataKey: '', fields: [
          { id: 'f1', key: 'x', label: 'X', type: 'number' },
        ]},
      ],
    })
    const groups = getGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('g1')
    expect(groups[0].fields[0].key).toBe('x')
  })

  it('replaces existing groups with inferred groups', () => {
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().setSchema({ groups: [] })
    expect(getGroups()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// bindGroupToTable — Phase 1 ScalarDB binding (atomic tableMeta + fields)
// ---------------------------------------------------------------------------

describe('bindGroupToTable', () => {
  /**
   * Seed a master group with two fields, each pre-bound to a column name,
   * and return its id. Mimics the state after a user has already bound a
   * group once.
   */
  function seedBoundGroup(tableMeta?: ScalarDbTableMeta): string {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    useReportStore.getState().addSchemaField(
      groupId,
      { key: 'name', label: '氏名', type: 'string' } as SchemaField,
    )
    useReportStore.getState().addSchemaField(
      groupId,
      { key: 'age', label: '年齢', type: 'number' } as SchemaField,
    )

    if (tableMeta) {
      // First bind
      useReportStore.getState().bindGroupToTable(groupId, tableMeta)
      // Pre-populate per-field column hints
      const fields = getGroups()[0].fields
      useReportStore.getState().updateSchemaField(
        groupId, fields[0].id, { dbColumnName: 'full_name' },
      )
      useReportStore.getState().updateSchemaField(
        groupId, fields[1].id, { dbColumnName: 'age' },
      )
    }
    return groupId
  }

  it('first bind sets tableMeta and leaves fields untouched', () => {
    const groupId = seedBoundGroup() // no prior bind
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app',
      tableName: 'users',
    })

    const group = getGroups()[0]
    expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'users' })
    // Fields have no dbColumnName yet — unchanged.
    expect(group.fields[0].dbColumnName).toBeUndefined()
    expect(group.fields[1].dbColumnName).toBeUndefined()
  })

  it('rebind to SAME table preserves every field dbColumnName', () => {
    const groupId = seedBoundGroup({ namespace: 'app', tableName: 'users' })

    // Rebind to the exact same table.
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app',
      tableName: 'users',
    })

    const group = getGroups()[0]
    expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'users' })
    // Field hints preserved — rebind to same table is a no-op for fields.
    expect(group.fields[0].dbColumnName).toBe('full_name')
    expect(group.fields[1].dbColumnName).toBe('age')
  })

  it('rebind to DIFFERENT tableName clears all field dbColumnName values', () => {
    const groupId = seedBoundGroup({ namespace: 'app', tableName: 'users' })

    // Rebind to a different table in the same namespace.
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app',
      tableName: 'customers',
    })

    const group = getGroups()[0]
    expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'customers' })
    // Field hints MUST be cleared — none of them refer to the new table.
    expect(group.fields[0].dbColumnName).toBeUndefined()
    expect(group.fields[1].dbColumnName).toBeUndefined()
  })

  it('rebind to DIFFERENT namespace clears all field dbColumnName values', () => {
    const groupId = seedBoundGroup({ namespace: 'app', tableName: 'users' })

    // Rebind to the same tableName but in a different namespace.
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'audit',
      tableName: 'users',
    })

    const group = getGroups()[0]
    expect(group.tableMeta).toEqual({ namespace: 'audit', tableName: 'users' })
    expect(group.fields[0].dbColumnName).toBeUndefined()
    expect(group.fields[1].dbColumnName).toBeUndefined()
  })

  it('unbind (undefined) atomically clears tableMeta AND all field dbColumnName', () => {
    const groupId = seedBoundGroup({ namespace: 'app', tableName: 'users' })

    useReportStore.getState().bindGroupToTable(groupId, undefined)

    const group = getGroups()[0]
    expect(group.tableMeta).toBeUndefined()
    expect(group.fields[0].dbColumnName).toBeUndefined()
    expect(group.fields[1].dbColumnName).toBeUndefined()
  })

  it('unbind on an already-unbound group is a no-op', () => {
    const groupId = seedBoundGroup() // never bound
    expect(() =>
      useReportStore.getState().bindGroupToTable(groupId, undefined),
    ).not.toThrow()
    expect(getGroups()[0].tableMeta).toBeUndefined()
  })

  it('does not touch other groups', () => {
    // Two groups, both bound to different tables with field hints.
    const id1 = seedBoundGroup({ namespace: 'app', tableName: 'users' })
    useReportStore.getState().addSchemaGroup('detail')
    const id2 = getGroups()[1].id
    useReportStore.getState().addSchemaField(
      id2, { key: 'line', label: 'Line', type: 'string' } as SchemaField,
    )
    useReportStore.getState().bindGroupToTable(id2, {
      namespace: 'app', tableName: 'line_items',
    })
    const lineFieldId = getGroups()[1].fields[0].id
    useReportStore.getState().updateSchemaField(
      id2, lineFieldId, { dbColumnName: 'line_no' },
    )

    // Unbind group 1 — group 2 must be untouched.
    useReportStore.getState().bindGroupToTable(id1, undefined)

    const g1 = getGroups().find((g) => g.id === id1)!
    const g2 = getGroups().find((g) => g.id === id2)!
    expect(g1.tableMeta).toBeUndefined()
    expect(g2.tableMeta).toEqual({ namespace: 'app', tableName: 'line_items' })
    expect(g2.fields[0].dbColumnName).toBe('line_no')
  })

  it('ignores nonexistent groupId', () => {
    expect(() =>
      useReportStore.getState().bindGroupToTable('nonexistent', {
        namespace: 'app', tableName: 'users',
      }),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// bindGroupToTableWithColumns — Phase 1.5 atomic bind + field mapping
// ---------------------------------------------------------------------------

describe('bindGroupToTableWithColumns', () => {
  function seedGroupWithFields(): { groupId: string; fieldIds: string[] } {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = getGroups()[0].id
    useReportStore.getState().addSchemaField(
      groupId,
      { key: 'name', label: '氏名', type: 'string' } as SchemaField,
    )
    useReportStore.getState().addSchemaField(
      groupId,
      { key: 'age', label: '年齢', type: 'number' } as SchemaField,
    )
    const fieldIds = getGroups()[0].fields.map((f) => f.id)
    return { groupId, fieldIds }
  }

  it('sets tableMeta and all fieldColumns dbColumnName in one call', () => {
    const { groupId, fieldIds } = seedGroupWithFields()

    useReportStore.getState().bindGroupToTableWithColumns(
      groupId,
      { namespace: 'app', tableName: 'users' },
      [
        { fieldId: fieldIds[0], dbColumnName: 'full_name' },
        { fieldId: fieldIds[1], dbColumnName: 'age_years' },
      ],
    )

    const group = getGroups()[0]
    expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'users' })
    expect(group.fields[0].dbColumnName).toBe('full_name')
    expect(group.fields[1].dbColumnName).toBe('age_years')
  })

  it('nonexistent groupId is a no-op — does not throw', () => {
    expect(() =>
      useReportStore.getState().bindGroupToTableWithColumns(
        'nonexistent',
        { namespace: 'app', tableName: 'users' },
        [],
      ),
    ).not.toThrow()
  })

  it('partial fieldColumns leaves unlisted fields untouched', () => {
    const { groupId, fieldIds } = seedGroupWithFields()
    // Pre-assign a dbColumnName to field[1]
    useReportStore.getState().updateSchemaField(groupId, fieldIds[1], { dbColumnName: 'existing' })

    useReportStore.getState().bindGroupToTableWithColumns(
      groupId,
      { namespace: 'app', tableName: 'users' },
      [{ fieldId: fieldIds[0], dbColumnName: 'full_name' }], // only field[0]
    )

    const group = getGroups()[0]
    expect(group.fields[0].dbColumnName).toBe('full_name')
    // field[1] must NOT be cleared — it was not in the fieldColumns list
    expect(group.fields[1].dbColumnName).toBe('existing')
  })

  it('fieldColumns entries referencing nonexistent fieldId are silently ignored', () => {
    const { groupId, fieldIds } = seedGroupWithFields()

    expect(() =>
      useReportStore.getState().bindGroupToTableWithColumns(
        groupId,
        { namespace: 'app', tableName: 'users' },
        [
          { fieldId: 'does-not-exist', dbColumnName: 'phantom' },
          { fieldId: fieldIds[0], dbColumnName: 'full_name' },
        ],
      ),
    ).not.toThrow()

    const group = getGroups()[0]
    expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'users' })
    expect(group.fields[0].dbColumnName).toBe('full_name')
    // field[1] untouched
    expect(group.fields[1].dbColumnName).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Phase 2: setElementSchemaBinding
// ---------------------------------------------------------------------------

function makeDataFieldEl(id: string): import('@/types').ReportElement {
  return {
    id,
    type: 'dataField',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: '',
    style: {},
  } as unknown as import('@/types').ReportElement
}

describe('setElementSchemaBinding', () => {
  it('要素に schemaBinding を設定できる', () => {
    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, makeDataFieldEl('el-sb-1'))
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-sb-1', 'field-uuid-1')
    const el = useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-sb-1')!
    expect(el.schemaBinding).toEqual({ fieldId: 'field-uuid-1' })
  })

  it('undefined を渡すと schemaBinding を削除できる', () => {
    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, makeDataFieldEl('el-sb-2'))
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-sb-2', 'field-uuid-1')
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-sb-2', undefined)
    const el = useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-sb-2')!
    expect(el.schemaBinding).toBeUndefined()
  })

  it('dataField の fieldKey を dataKey.key に同期し、解除時に空にする', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().updateSchemaGroup(groupId, { dataKey: 'customer' })
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '氏名', type: 'string' })
    const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id

    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, makeDataFieldEl('el-fk-sync'))
    const getEl = () => useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-fk-sync') as { fieldKey?: string }

    useReportStore.getState().setElementSchemaBinding(pageId, 'el-fk-sync', fieldId)
    expect(getEl().fieldKey).toBe('customer.name')

    useReportStore.getState().setElementSchemaBinding(pageId, 'el-fk-sync', undefined)
    expect(getEl().fieldKey).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Phase 2: removeSchemaField cleanup — schemaBinding cascade
// ---------------------------------------------------------------------------

describe('removeSchemaField schemaBinding cleanup', () => {
  it('フィールド削除時に要素の schemaBinding が同一 set() 内でクリアされる', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '名前', type: 'string' })
    const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id

    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, makeDataFieldEl('el-cleanup-1'))
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-cleanup-1', fieldId)

    expect(useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-cleanup-1')!
      .schemaBinding?.fieldId).toBe(fieldId)

    useReportStore.getState().removeSchemaField(groupId, fieldId)

    expect(useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-cleanup-1')!
      .schemaBinding).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Phase 2: removeSchemaGroup cleanup — schemaBinding cascade
// ---------------------------------------------------------------------------

describe('removeSchemaGroup schemaBinding cleanup', () => {
  it('グループ削除時に要素の schemaBinding がクリアされる', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '名前', type: 'string' })
    const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id

    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, makeDataFieldEl('el-grp-cleanup'))
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-grp-cleanup', fieldId)

    expect(useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-grp-cleanup')!
      .schemaBinding?.fieldId).toBe(fieldId)

    useReportStore.getState().removeSchemaGroup(groupId)

    expect(useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-grp-cleanup')!
      .schemaBinding).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Schema API state — initial values
// ---------------------------------------------------------------------------

describe('schema API state initial values', () => {
  it('has correct initial state', () => {
    const state = useReportStore.getState()
    expect(state.schemaId).toBeNull()
    expect(state.schemaName).toBe('')
    expect(state.schemaVisibility).toBe('private')
    expect(state.schemaLoading).toBe(false)
    expect(state.schemaSaving).toBe(false)
    expect(state.schemaPendingCreate).toBe(false)
    expect(state.schemaError).toBeNull()
    expect(state.schemaUpdatedAt).toBeNull()
    expect(state.schemaList).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// fetchSchemaList — async action
// ---------------------------------------------------------------------------

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
  }
})

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    isApiError: (err: unknown): err is { status: number } =>
      err !== null && typeof err === 'object' && 'status' in err,
  }
})

describe('fetchSchemaList', () => {
  it('sets schemaLoading during fetch and populates schemaList on success', async () => {
    const { listSchemas } = await import('@/api/reportApi')
    const mockList = vi.mocked(listSchemas)
    mockList.mockResolvedValueOnce({
      items: [
        { id: 'sch-1', name: 'テスト', visibility: 'private', createdBy: 'user1', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      total: 1,
    })

    const promise = useReportStore.getState().fetchSchemaList()
    expect(useReportStore.getState().schemaLoading).toBe(true)
    await promise
    expect(useReportStore.getState().schemaLoading).toBe(false)
    expect(useReportStore.getState().schemaList).toHaveLength(1)
    expect(useReportStore.getState().schemaList[0].name).toBe('テスト')
  })

  it('sets schemaError on fetch failure', async () => {
    const { listSchemas } = await import('@/api/reportApi')
    const mockList = vi.mocked(listSchemas)
    mockList.mockRejectedValueOnce(new Error('Network error'))

    await useReportStore.getState().fetchSchemaList()
    expect(useReportStore.getState().schemaLoading).toBe(false)
    expect(useReportStore.getState().schemaError).toBe('Network error')
  })
})

// ---------------------------------------------------------------------------
// saveSchema — async action
// ---------------------------------------------------------------------------

describe('saveSchema', () => {
  it('creates new schema when schemaId is null', async () => {
    const { createSchema } = await import('@/api/reportApi')
    const mockCreate = vi.mocked(createSchema)
    mockCreate.mockResolvedValueOnce({ id: 'new-id', name: 'テスト', updatedAt: 1000 })

    useReportStore.getState().addSchemaGroup('master')
    useReportStore.setState({ schemaName: 'テスト' })

    await useReportStore.getState().saveSchema()
    expect(useReportStore.getState().schemaId).toBe('new-id')
    expect(useReportStore.getState().schemaUpdatedAt).toBe(1000)
    expect(useReportStore.getState().schemaSaving).toBe(false)
    expect(useReportStore.getState().schemaPendingCreate).toBe(false)
  })

  it('updates existing schema when schemaId is present', async () => {
    const { updateSchema } = await import('@/api/reportApi')
    const mockUpdate = vi.mocked(updateSchema)
    mockUpdate.mockResolvedValueOnce({ status: 'saved', id: 'existing-id', updatedAt: 2000 })

    useReportStore.setState({
      schemaId: 'existing-id',
      schemaName: 'テスト',
      schemaVisibility: 'private',
      schemaUpdatedAt: 1000,
    })
    useReportStore.getState().addSchemaGroup('master')

    await useReportStore.getState().saveSchema()
    expect(useReportStore.getState().schemaUpdatedAt).toBe(2000)
    expect(mockUpdate).toHaveBeenCalledWith('existing-id', expect.objectContaining({
      updatedAt: 1000,
    }))
  })

  it('throws user-friendly error on 409 conflict', async () => {
    const { updateSchema } = await import('@/api/reportApi')
    const mockUpdate = vi.mocked(updateSchema)
    const conflictError = Object.assign(new Error('Conflict'), { status: 409, body: '' })
    mockUpdate.mockRejectedValueOnce(conflictError)

    useReportStore.setState({
      schemaId: 'existing-id',
      schemaName: 'テスト',
      schemaVisibility: 'private',
      schemaUpdatedAt: 1000,
    })
    useReportStore.getState().addSchemaGroup('master')

    await expect(useReportStore.getState().saveSchema()).rejects.toThrow('他のユーザー')
    expect(useReportStore.getState().schemaSaving).toBe(false)
  })

  it('does not save when schemaSaving is already true', async () => {
    const { createSchema, updateSchema } = await import('@/api/reportApi')
    const mockCreate = vi.mocked(createSchema)
    const mockUpdate = vi.mocked(updateSchema)
    mockCreate.mockClear()
    mockUpdate.mockClear()

    useReportStore.setState({ schemaSaving: true })
    await useReportStore.getState().saveSchema()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// deleteSchema — async action
// ---------------------------------------------------------------------------

describe('deleteSchema', () => {
  it('removes item from schemaList after deletion', async () => {
    const reportApi = await import('@/api/reportApi')
    const mockDelete = vi.mocked(reportApi.deleteSchema)
    mockDelete.mockResolvedValueOnce(undefined)

    useReportStore.setState({
      schemaList: [
        { id: 'sch-1', name: 'A', visibility: 'private', createdBy: 'u1', createdAt: '', updatedAt: '' },
        { id: 'sch-2', name: 'B', visibility: 'shared', createdBy: 'u1', createdAt: '', updatedAt: '' },
      ],
    })

    await useReportStore.getState().deleteSchema('sch-1')
    expect(useReportStore.getState().schemaList).toHaveLength(1)
    expect(useReportStore.getState().schemaList[0].id).toBe('sch-2')
  })

  it('clears schemaId when deleting the currently loaded schema', async () => {
    const reportApi = await import('@/api/reportApi')
    const mockDelete = vi.mocked(reportApi.deleteSchema)
    mockDelete.mockResolvedValueOnce(undefined)

    useReportStore.setState({
      schemaId: 'sch-1',
      schemaName: 'Active',
      schemaList: [
        { id: 'sch-1', name: 'Active', visibility: 'private', createdBy: 'u1', createdAt: '', updatedAt: '' },
      ],
    })

    await useReportStore.getState().deleteSchema('sch-1')
    expect(useReportStore.getState().schemaId).toBeNull()
    expect(useReportStore.getState().schemaName).toBe('')
  })
})

// ---------------------------------------------------------------------------
// #144: named relation actions
// ---------------------------------------------------------------------------

function getRelations() {
  return useReportStore.getState().definition.schema?.relations ?? []
}

const LOOKUP = {
  name: 'product', from: 'items', to: '__productMaster__',
  on: { fromColumn: 'product_code', toColumn: 'code' }, kind: 'lookup' as const,
}

describe('addSchemaRelation / removeSchemaRelation / updateSchemaRelation (#144)', () => {
  it('adds a relation with a generated id', () => {
    useReportStore.getState().addSchemaRelation(LOOKUP)
    const rels = getRelations()
    expect(rels).toHaveLength(1)
    expect(rels[0].id).toBeTruthy()
    expect(rels[0].name).toBe('product')
    expect(rels[0].kind).toBe('lookup')
  })

  it('initializes schema + relations array when absent', () => {
    // newReport leaves schema undefined until first mutation
    useReportStore.getState().addSchemaRelation(LOOKUP)
    expect(useReportStore.getState().definition.schema?.relations).toHaveLength(1)
  })

  it('removes a relation by id', () => {
    useReportStore.getState().addSchemaRelation(LOOKUP)
    const id = getRelations()[0].id
    useReportStore.getState().removeSchemaRelation(id)
    expect(getRelations()).toHaveLength(0)
  })

  it('updates a relation in place', () => {
    useReportStore.getState().addSchemaRelation(LOOKUP)
    const id = getRelations()[0].id
    useReportStore.getState().updateSchemaRelation(id, { name: 'renamed' })
    expect(getRelations()[0].name).toBe('renamed')
  })

  it('is a no-op when removing/updating an unknown relation id', () => {
    useReportStore.getState().addSchemaRelation(LOOKUP)
    expect(() => useReportStore.getState().removeSchemaRelation('ghost')).not.toThrow()
    expect(() => useReportStore.getState().updateSchemaRelation('ghost', { name: 'x' })).not.toThrow()
    expect(getRelations()).toHaveLength(1)
  })
})
