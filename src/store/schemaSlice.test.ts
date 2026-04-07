import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from './index'
import type { SchemaGroup, SchemaField } from '@/types'

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
