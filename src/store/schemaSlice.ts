/**
 * Schema slice — SchemaDefinition CRUD (groups + fields).
 * Schema lives on definition but is not in undo/redo history (same as calculationRules).
 */

import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { SchemaGroup, SchemaField } from '@/types'
import type { StoreState } from './types'

export type SchemaSlice = Pick<StoreState,
  | 'addSchemaGroup'
  | 'removeSchemaGroup'
  | 'updateSchemaGroup'
  | 'addSchemaField'
  | 'removeSchemaField'
  | 'updateSchemaField'
  | 'bindGroupToTable'
  | 'bindGroupToTableWithColumns'
  | 'setSchema'
>

export const createSchemaSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  SchemaSlice
> = (set) => ({
  addSchemaGroup: (role) => set((s) => {
    if (!s.definition.schema) {
      s.definition.schema = { groups: [] }
    }
    const group: SchemaGroup = {
      id: uuidv4(),
      label: role === 'master' ? 'マスター' : '明細',
      role,
      dataKey: '',
      fields: [],
    }
    s.definition.schema.groups.push(group)
  }),

  removeSchemaGroup: (groupId) => set((s) => {
    if (!s.definition.schema) return
    s.definition.schema.groups = s.definition.schema.groups.filter((g) => g.id !== groupId)
  }),

  updateSchemaGroup: (groupId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    Object.assign(group, patch)
  }),

  addSchemaField: (groupId, field) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    const newField: SchemaField = { ...field, id: uuidv4() }
    group.fields.push(newField)
  }),

  removeSchemaField: (groupId, fieldId) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    group.fields = group.fields.filter((f) => f.id !== fieldId)
  }),

  updateSchemaField: (groupId, fieldId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    const field = group?.fields.find((f) => f.id === fieldId)
    if (!field) return
    Object.assign(field, patch)
  }),

  bindGroupToTable: (groupId, tableMeta) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return

    if (tableMeta === undefined) {
      // Unbind ("解除") — drop tableMeta AND clear dbColumnName on every field.
      // The entire binding unit is the domain event; callers can never leak
      // orphaned dbColumnName hints that point at a table the group no longer
      // references.
      delete group.tableMeta
      group.fields.forEach((f) => { delete f.dbColumnName })
      return
    }

    // Rebind to a DIFFERENT (namespace, tableName) → clear all field column
    // hints because none of them can refer to the new table. Prevents the
    // hostile UX where every row would immediately show "(列が存在しません)"
    // after the rebind. Same-table rebind (or first bind) preserves hints.
    const prev = group.tableMeta
    const isRebindToDifferentTable =
      prev !== undefined &&
      (prev.namespace !== tableMeta.namespace || prev.tableName !== tableMeta.tableName)
    if (isRebindToDifferentTable) {
      group.fields.forEach((f) => { delete f.dbColumnName })
    }
    group.tableMeta = { namespace: tableMeta.namespace, tableName: tableMeta.tableName }
  }),

  bindGroupToTableWithColumns: (groupId, tableMeta, fieldColumns) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return

    group.tableMeta = { namespace: tableMeta.namespace, tableName: tableMeta.tableName }

    for (const { fieldId, dbColumnName } of fieldColumns) {
      const field = group.fields.find((f) => f.id === fieldId)
      if (!field) continue
      field.dbColumnName = dbColumnName
    }
    // Does NOT call pushHistory — matches the existing bindGroupToTable convention.
    // The schema slice is outside the history system in Phase 1.
  }),

  setSchema: (schema) => set((s) => {
    s.definition.schema = schema
  }),
})
