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
})
